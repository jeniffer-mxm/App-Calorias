from pymongo import MongoClient

try:
    client = MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=3000)
    print("✅ Conectado ao MongoDB!")
    print("Bancos disponíveis:", client.list_database_names())
except Exception as e:
    print("❌ Erro ao conectar:", e)
