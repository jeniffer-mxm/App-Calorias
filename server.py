from fastapi import FastAPI, HTTPException, Depends, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
from typing import Optional, List
import os
import bcrypt
import jwt
from datetime import datetime, timedelta
import motor.motor_asyncio
from bson import ObjectId
import uuid
import base64
from io import BytesIO
from PIL import Image
import json
from dotenv import load_dotenv

# Carregar variáveis de ambiente
load_dotenv()

# Importar biblioteca de integração LLM
#from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

app = FastAPI(title="Calorie Tracker API")

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configurações
SECRET_KEY = "calorie_tracker_secret_key_123"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# MongoDB
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "calorie_tracker")

client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Security
security = HTTPBearer()

# Modelos Pydantic
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    age: int
    weight: float
    height: float
    gender: str
    activity_level: str
    goal_weight: Optional[float] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class FoodEntry(BaseModel):
    name: str
    calories: float
    proteins: float
    carbs: float
    fats: float
    quantity: float = 1.0

class ActivityEntry(BaseModel):
    name: str
    duration_minutes: int
    calories_burned: float

class FoodAnalysisResponse(BaseModel):
    food_name: str
    calories: float
    proteins: float
    carbs: float
    fats: float
    confidence: str

# Funções utilitárias
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Token inválido")
        
        user = await db.users.find_one({"_id": user_id})
        if user is None:
            raise HTTPException(status_code=401, detail="Usuário não encontrado")
        
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Token inválido")

def calculate_bmr(age: int, weight: float, height: float, gender: str) -> float:
    """Calcula Taxa Metabólica Basal usando fórmula Mifflin-St Jeor"""
    if gender.lower() == "masculino":
        bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5
    else:
        bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161
    return bmr

def calculate_daily_calories(bmr: float, activity_level: str) -> float:
    """Calcula calorias diárias baseado no nível de atividade"""
    multipliers = {
        "sedentário": 1.2,
        "pouco_ativo": 1.375,
        "moderadamente_ativo": 1.55,
        "muito_ativo": 1.725,
        "extremamente_ativo": 1.9
    }
    return bmr * multipliers.get(activity_level, 1.2)

async def analyze_food_image(image_base64: str) -> dict:
    """Analisa imagem de comida usando OpenAI GPT-4o"""
    try:
        # Obter chave da API
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="API key não configurada")

        # Criar instância do chat LLM
        chat = LlmChat(
            api_key=api_key,
            session_id=f"food_analysis_{datetime.utcnow().timestamp()}",
            system_message="""Você é um especialista em nutrição. Analise a imagem de comida e forneça:
1. Nome do alimento principal
2. Estimativa de calorias por porção
3. Proteínas (em gramas)
4. Carboidratos (em gramas) 
5. Gorduras (em gramas)

Responda APENAS em formato JSON válido:
{
  "food_name": "nome do alimento",
  "calories": número,
  "proteins": número,
  "carbs": número,
  "fats": número,
  "confidence": "alta/média/baixa"
}"""
        ).with_model("openai", "gpt-4o")

        # Criar conteúdo da imagem
        image_content = ImageContent(image_base64=image_base64)

        # Criar mensagem do usuário
        user_message = UserMessage(
            text="Analise esta imagem de comida e forneça as informações nutricionais em JSON.",
            file_contents=[image_content]
        )

        # Enviar mensagem e obter resposta
        response = await chat.send_message(user_message)
        
        # Tentar parsear a resposta JSON
        try:
            # Limpar resposta (remover markdown se houver)
            clean_response = response.strip()
            if clean_response.startswith("```json"):
                clean_response = clean_response.replace("```json", "").replace("```", "").strip()
            
            result = json.loads(clean_response)
            
            # Validar campos obrigatórios
            required_fields = ["food_name", "calories", "proteins", "carbs", "fats"]
            for field in required_fields:
                if field not in result:
                    raise ValueError(f"Campo obrigatório ausente: {field}")
            
            return result
            
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Erro ao parsear resposta da IA: {response}")
            # Resposta de fallback
            return {
                "food_name": "Alimento não identificado",
                "calories": 200,
                "proteins": 5,
                "carbs": 30,
                "fats": 8,
                "confidence": "baixa"
            }

    except Exception as e:
        print(f"Erro na análise de imagem: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro na análise da imagem: {str(e)}")

# Endpoints

#@app.get("/")
#async def root():
 #   return {"message": "Calorie Tracker API funcionando!"}
@app.post("/api/analyze-food")
async def analyze_food(file: UploadFile = File(...)):
    return {
    
        "name": None,
        "estimated_calories": None,
        "unit": "kcal",
        "confidence": 0.0,
        "notes": "Análise de imagem desativada"
    }

@app.post("/api/register")
async def register_user(user: UserCreate):
    """Registrar novo usuário"""
    # Verificar se email já existe
    existing_user = await db.users.find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    
    # Criar usuário
    user_id = str(uuid.uuid4())
    hashed_password = hash_password(user.password)
    
    # Calcular necessidades calóricas
    bmr = calculate_bmr(user.age, user.weight, user.height, user.gender)
    daily_calories = calculate_daily_calories(bmr, user.activity_level)
    
    user_doc = {
        "_id": user_id,
        "email": user.email,
        "password": hashed_password,
        "name": user.name,
        "age": user.age,
        "weight": user.weight,
        "height": user.height,
        "gender": user.gender,
        "activity_level": user.activity_level,
        "goal_weight": user.goal_weight,
        "bmr": bmr,
        "daily_calories": daily_calories,
        "profile_photo": None,
        "created_at": datetime.utcnow()
    }
    
    await db.users.insert_one(user_doc)
    
    # Criar token
    token = create_access_token(data={"sub": user_id})
    
    return {
        "message": "Usuário criado com sucesso",
        "token": token,
        "user": {
            "id": user_id,
            "email": user.email,
            "name": user.name,
            "daily_calories": daily_calories
        }
    }

@app.post("/api/login")
async def login_user(user: UserLogin):
    """Login do usuário"""
    db_user = await db.users.find_one({"email": user.email})
    if not db_user or not verify_password(user.password, db_user["password"]):
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")
    
    token = create_access_token(data={"sub": db_user["_id"]})
    
    return {
        "message": "Login realizado com sucesso",
        "token": token,
        "user": {
            "id": db_user["_id"],
            "email": db_user["email"],
            "name": db_user["name"],
            "daily_calories": db_user.get("daily_calories", 2000)
        }
    }

@app.post("/api/upload-profile-photo")
async def upload_profile_photo(
    file: UploadFile = File(...),
    current_user = Depends(get_current_user)
):
    """Upload da foto de perfil"""
    try:
        # Ler arquivo
        contents = await file.read()
        
        # Converter para base64
        image = Image.open(BytesIO(contents))
        image = image.resize((200, 200))  # Redimensionar
        
        buffered = BytesIO()
        image.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode()
        
        # Salvar no banco
        await db.users.update_one(
            {"_id": current_user["_id"]},
            {"$set": {"profile_photo": img_base64}}
        )
        
        return {"message": "Foto de perfil atualizada com sucesso"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao processar imagem: {str(e)}")

@app.post("/api/analyze-food")
async def analyze_food(
    file: UploadFile = File(...),
    current_user = Depends(get_current_user)
):
    """Analisar imagem de comida com IA"""
    try:
        # Ler arquivo
        contents = await file.read()
        
        # Converter para base64
        img_base64 = base64.b64encode(contents).decode()
        
        # Analisar com IA
        analysis = await analyze_food_image(img_base64)
        
        return {
            "success": True,
            "analysis": analysis
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na análise: {str(e)}")

@app.post("/api/add-food")
async def add_food(
    food: FoodEntry,
    current_user = Depends(get_current_user)
):
    """Adicionar alimento ao diário"""
    entry_id = str(uuid.uuid4())
    food_doc = {
        "_id": entry_id,
        "user_id": current_user["_id"],
        "name": food.name,
        "calories": food.calories,
        "proteins": food.proteins,
        "carbs": food.carbs,
        "fats": food.fats,
        "quantity": food.quantity,
        "date": datetime.utcnow().date().isoformat(),
        "datetime": datetime.utcnow()
    }
    
    await db.food_entries.insert_one(food_doc)
    
    return {"message": "Alimento adicionado com sucesso", "id": entry_id}

@app.post("/api/add-activity")
async def add_activity(
    activity: ActivityEntry,
    current_user = Depends(get_current_user)
):
    """Adicionar atividade física"""
    entry_id = str(uuid.uuid4())
    activity_doc = {
        "_id": entry_id,
        "user_id": current_user["_id"],
        "name": activity.name,
        "duration_minutes": activity.duration_minutes,
        "calories_burned": activity.calories_burned,
        "date": datetime.utcnow().date().isoformat(),
        "datetime": datetime.utcnow()
    }
    
    await db.activities.insert_one(activity_doc)
    
    return {"message": "Atividade adicionada com sucesso", "id": entry_id}

@app.get("/api/daily-summary")
async def get_daily_summary(
    date: Optional[str] = None,
    current_user = Depends(get_current_user)
):
    """Obter resumo diário de calorias"""
    if not date:
        date = datetime.utcnow().date().isoformat()
    
    # Buscar alimentos do dia
    foods = await db.food_entries.find({"user_id": current_user["_id"], "date": date}).to_list(None)
    
    # Buscar atividades do dia
    activities = await db.activities.find({"user_id": current_user["_id"], "date": date}).to_list(None)
    
    # Calcular totais
    total_calories_consumed = sum(food["calories"] * food["quantity"] for food in foods)
    total_proteins = sum(food["proteins"] * food["quantity"] for food in foods)
    total_carbs = sum(food["carbs"] * food["quantity"] for food in foods)
    total_fats = sum(food["fats"] * food["quantity"] for food in foods)
    
    total_calories_burned = sum(activity["calories_burned"] for activity in activities)
    
    net_calories = total_calories_consumed - total_calories_burned
    daily_goal = current_user.get("daily_calories", 2000)
    
    return {
        "date": date,
        "calories_consumed": total_calories_consumed,
        "calories_burned": total_calories_burned,
        "net_calories": net_calories,
        "daily_goal": daily_goal,
        "remaining_calories": daily_goal - net_calories,
        "macros": {
            "proteins": total_proteins,
            "carbs": total_carbs,
            "fats": total_fats
        },
        "foods": foods,
        "activities": activities
    }

@app.get("/api/weekly-summary")
async def get_weekly_summary(current_user = Depends(get_current_user)):
    """Obter resumo semanal"""
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=6)
    
    # Buscar dados da semana
    foods = await db.food_entries.find({
        "user_id": current_user["_id"],
        "date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
    }).to_list(None)
    
    activities = await db.activities.find({
        "user_id": current_user["_id"],
        "date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
    }).to_list(None)
    
    # Agrupar por dia
    daily_data = {}
    
    for i in range(7):
        current_date = start_date + timedelta(days=i)
        date_str = current_date.isoformat()
        
        day_foods = [f for f in foods if f["date"] == date_str]
        day_activities = [a for a in activities if a["date"] == date_str]
        
        calories_consumed = sum(f["calories"] * f["quantity"] for f in day_foods)
        calories_burned = sum(a["calories_burned"] for a in day_activities)
        
        daily_data[date_str] = {
            "calories_consumed": calories_consumed,
            "calories_burned": calories_burned,
            "net_calories": calories_consumed - calories_burned
        }
    
    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "daily_data": daily_data
    }

@app.get("/api/profile")
async def get_profile(current_user = Depends(get_current_user)):
    """Obter perfil do usuário"""
    return {
        "id": current_user["_id"],
        "email": current_user["email"],
        "name": current_user["name"],
        "age": current_user["age"],
        "weight": current_user["weight"],
        "height": current_user["height"],
        "gender": current_user["gender"],
        "activity_level": current_user["activity_level"],
        "goal_weight": current_user.get("goal_weight"),
        "daily_calories": current_user.get("daily_calories", 2000),
        "profile_photo": current_user.get("profile_photo")
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)