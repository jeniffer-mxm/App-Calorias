// Configuração da API
//const API_BASE_URL = 'http://127.0.0.1:8001/api'; 
// DEPOIS (funciona no celular - MANTENHA ATIVO)
const API_BASE_URL = 'http://192.168.1.102:8001/api';
// Exemplo: 'http://192.168.1.100:8001/api' 
// O restante do código permanece o mesmo.

// Estado da aplicação
let currentUser = null;
let authToken = null;
let currentDate = new Date().toISOString().split('T')[0];
let cameraStream = null;
let dailyData = null;

// Elementos DOM
const elements = {
    // Screens
    loginScreen: document.getElementById('loginScreen'),
    mainScreen: document.getElementById('mainScreen'),
    loading: document.getElementById('loading'),
    
    // Auth forms
    loginForm: document.getElementById('loginForm'),
    registerForm: document.getElementById('registerForm'),
    
    // Tab navigation
    tabButtons: document.querySelectorAll('.tab-btn'),
    navTabs: document.querySelectorAll('.nav-tab'),
    tabContents: document.querySelectorAll('.tab-content'),
    
    // Dashboard elements
    userName: document.getElementById('userName'),
    caloriesConsumed: document.getElementById('caloriesConsumed'),
    caloriesBurned: document.getElementById('caloriesBurned'),
    caloriesRemaining: document.getElementById('caloriesRemaining'),
    
    // Camera elements
    cameraVideo: document.getElementById('cameraVideo'),
    cameraCanvas: document.getElementById('cameraCanvas'),
    cameraPreview: document.getElementById('cameraPreview'),
    startCameraBtn: document.getElementById('startCameraBtn'),
    captureBtn: document.getElementById('captureBtn'),
    stopCameraBtn: document.getElementById('stopCameraBtn'),
    imageUpload: document.getElementById('imageUpload'),
    
    // Analysis results
    analysisResults: document.getElementById('analysisResults'),
    foodName: document.getElementById('foodName'),
    foodCalories: document.getElementById('foodCalories'),
    foodProteins: document.getElementById('foodProteins'),
    foodCarbs: document.getElementById('foodCarbs'),
    foodFats: document.getElementById('foodFats'),
    foodQuantity: document.getElementById('foodQuantity'),
    addAnalyzedFoodBtn: document.getElementById('addAnalyzedFoodBtn'),
    
    // Manual food form
    manualFoodForm: document.getElementById('manualFoodForm'),
    foodsList: document.getElementById('foodsList'),
    
    // Activity form
    activityForm: document.getElementById('activityForm'),
    activitiesList: document.getElementById('activitiesList'),
    
    // Date selector
    selectedDate: document.getElementById('selectedDate'),
    prevDayBtn: document.getElementById('prevDayBtn'),
    nextDayBtn: document.getElementById('nextDayBtn'),
    
    // Profile
    profileBtn: document.getElementById('profileBtn'),
    profileModal: document.getElementById('profileModal'),
    closeProfileModal: document.getElementById('closeProfileModal'),
    logoutBtn: document.getElementById('logoutBtn'),
    profilePhoto: document.getElementById('profilePhoto'),
    profilePhotoInput: document.getElementById('profilePhotoInput')
};

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    // Verificar se há token salvo
    authToken = localStorage.getItem('authToken');
    if (authToken) {
        showLoading(true);
        loadUserProfile().then(() => {
            showMainScreen();
            loadDashboard();
        }).catch(() => {
            localStorage.removeItem('authToken');
            showLoginScreen();
        }).finally(() => {
            showLoading(false);
        });
    } else {
        showLoginScreen();
    }
    
    setupEventListeners();
    elements.selectedDate.value = currentDate;
}

function setupEventListeners() {
    // Auth tabs
    elements.tabButtons.forEach(btn => {
        btn.addEventListener('click', () => switchAuthTab(btn.dataset.tab));
    });
    
    // Auth forms
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.registerForm.addEventListener('submit', handleRegister);
    
    // Navigation tabs
    elements.navTabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    
    // Camera controls
    elements.startCameraBtn.addEventListener('click', startCamera);
    elements.captureBtn.addEventListener('click', captureImage);
    elements.stopCameraBtn.addEventListener('click', stopCamera);
    elements.imageUpload.addEventListener('change', handleImageUpload);
    
    // Food analysis
    elements.addAnalyzedFoodBtn.addEventListener('click', addAnalyzedFood);
    
    // Manual forms
    elements.manualFoodForm.addEventListener('submit', handleManualFood);
    elements.activityForm.addEventListener('submit', handleActivity);
    
    // Date navigation
    elements.prevDayBtn.addEventListener('click', () => changeDate(-1));
    elements.nextDayBtn.addEventListener('click', () => changeDate(1));
    elements.selectedDate.addEventListener('change', (e) => {
        currentDate = e.target.value;
        loadDailyData();
    });
    
    // Profile
    elements.profileBtn.addEventListener('click', showProfile);
    elements.closeProfileModal.addEventListener('click', closeProfile);
    elements.logoutBtn.addEventListener('click', logout);
    elements.profilePhotoInput.addEventListener('change', handleProfilePhotoUpload);
    
    // Modal click outside
    elements.profileModal.addEventListener('click', (e) => {
        if (e.target === elements.profileModal) {
            closeProfile();
        }
    });
}

// Utility functions
function showLoading(show) {
    if (show) {
        elements.loading.classList.remove('hidden');
    } else {
        elements.loading.classList.add('hidden');
    }
}

function showLoginScreen() {
    elements.loginScreen.classList.add('active');
    elements.mainScreen.classList.remove('active');
}

function showMainScreen() {
    elements.loginScreen.classList.remove('active');
    elements.mainScreen.classList.add('active');
}

function showNotification(message, type = 'success') {
    // Criar notificação simples
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#22c55e' : '#ef4444'};
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        z-index: 10000;
        font-family: 'Satoshi';
        font-weight: 500;
        box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Auth functions
function switchAuthTab(tabName) {
    elements.tabButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    document.querySelectorAll('.auth-form').forEach(form => {
        form.classList.toggle('active', form.id === `${tabName}Form`);
    });
}

async function handleLogin(e) {
    e.preventDefault();
    showLoading(true);
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);
            showMainScreen();
            loadDashboard();
            showNotification('Login realizado com sucesso!');
        } else {
            showNotification(data.detail || 'Erro no login', 'error');
        }
    } catch (error) {
        showNotification('Erro de conexão', 'error');
    } finally {
        showLoading(false);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    showLoading(true);
    
    const formData = {
        name: document.getElementById('registerName').value,
        email: document.getElementById('registerEmail').value,
        password: document.getElementById('registerPassword').value,
        age: parseInt(document.getElementById('registerAge').value),
        gender: document.getElementById('registerGender').value,
        weight: parseFloat(document.getElementById('registerWeight').value),
        height: parseFloat(document.getElementById('registerHeight').value),
        activity_level: document.getElementById('registerActivity').value,
        goal_weight: document.getElementById('registerGoalWeight').value ? 
                    parseFloat(document.getElementById('registerGoalWeight').value) : null
    };
    
    try {
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);
            showMainScreen();
            loadDashboard();
            showNotification('Conta criada com sucesso!');
        } else {
            showNotification(data.detail || 'Erro no cadastro', 'error');
        }
    } catch (error) {
        showNotification('Erro de conexão', 'error');
    } finally {
        showLoading(false);
    }
}

async function loadUserProfile() {
    try {
        const response = await fetch(`${API_BASE_URL}/profile`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const userData = await response.json();
            currentUser = userData;
            elements.userName.textContent = userData.name;
            
            // Carregar foto de perfil se existir
            if (userData.profile_photo) {
                const img = document.createElement('img');
                img.src = `data:image/png;base64,${userData.profile_photo}`;
                elements.profilePhoto.innerHTML = '';
                elements.profilePhoto.appendChild(img);
            }
        } else {
            throw new Error('Failed to load profile');
        }
    } catch (error) {
        throw error;
    }
}

function logout() {
    localStorage.removeItem('authToken');
    authToken = null;
    currentUser = null;
    showLoginScreen();
    showNotification('Logout realizado com sucesso!');
}

// Navigation functions
function switchTab(tabName) {
    elements.navTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    elements.tabContents.forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}Tab`);
    });
    
    // Carregar dados específicos da aba
    if (tabName === 'dashboard') {
        loadDashboard();
    } else if (tabName === 'diary') {
        loadDailyData();
    } else if (tabName === 'activities') {
        loadDailyData();
    }
}

// Dashboard functions
async function loadDashboard() {
    try {
        await loadDailyData();
        await loadWeeklyChart();
        loadMacrosChart();
    } catch (error) {
        showNotification('Erro ao carregar dashboard', 'error');
    }
}

async function loadDailyData() {
    try {
        const response = await fetch(`${API_BASE_URL}/daily-summary?date=${currentDate}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            dailyData = await response.json();
            updateDashboardCards();
            updateFoodsList();
            updateActivitiesList();
            loadMacrosChart();
        }
    } catch (error) {
        showNotification('Erro ao carregar dados do dia', 'error');
    }
}

function updateDashboardCards() {
    if (!dailyData) return;
    
    elements.caloriesConsumed.textContent = Math.round(dailyData.calories_consumed);
    elements.caloriesBurned.textContent = Math.round(dailyData.calories_burned);
    elements.caloriesRemaining.textContent = Math.round(dailyData.remaining_calories);
}

// Camera functions
async function startCamera() {
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'environment'
            } 
        });
        
        elements.cameraVideo.srcObject = cameraStream;
        elements.cameraVideo.style.display = 'block';
        elements.cameraPreview.style.display = 'none';
        
        elements.startCameraBtn.classList.add('hidden');
        elements.captureBtn.classList.remove('hidden');
        elements.stopCameraBtn.classList.remove('hidden');
        
    } catch (error) {
        showNotification('Erro ao acessar câmera', 'error');
        console.error('Camera error:', error);
    }
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    
    elements.cameraVideo.style.display = 'none';
    elements.cameraPreview.style.display = 'flex';
    
    elements.startCameraBtn.classList.remove('hidden');
    elements.captureBtn.classList.add('hidden');
    elements.stopCameraBtn.classList.add('hidden');
}

function captureImage() {
    const canvas = elements.cameraCanvas;
    const video = elements.cameraVideo;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    // Converter para blob e analisar
    canvas.toBlob(async (blob) => {
        stopCamera();
        await analyzeImage(blob);
    }, 'image/jpeg', 0.8);
}

async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        await analyzeImage(file);
    }
}

async function analyzeImage(imageFile) {
    showLoading(true);
    
    try {
        const formData = new FormData();
        formData.append('file', imageFile);
        
        const response = await fetch(`${API_BASE_URL}/analyze-food`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            displayAnalysisResults(data.analysis);
        } else {
            showNotification(data.detail || 'Erro na análise da imagem', 'error');
        }
    } catch (error) {
        showNotification('Erro ao analisar imagem', 'error');
    } finally {
        showLoading(false);
    }
}

function displayAnalysisResults(analysis) {
    elements.foodName.textContent = analysis.food_name;
    elements.foodCalories.textContent = analysis.calories;
    elements.foodProteins.textContent = `${analysis.proteins}g`;
    elements.foodCarbs.textContent = `${analysis.carbs}g`;
    elements.foodFats.textContent = `${analysis.fats}g`;
    elements.foodQuantity.value = 1;
    
    elements.analysisResults.classList.remove('hidden');
    elements.analysisResults.scrollIntoView({ behavior: 'smooth' });
    
    // Armazenar dados para adicionar ao diário
    elements.addAnalyzedFoodBtn.dataset.analysis = JSON.stringify(analysis);
}

async function addAnalyzedFood() {
    const analysis = JSON.parse(elements.addAnalyzedFoodBtn.dataset.analysis);
    const quantity = parseFloat(elements.foodQuantity.value);
    
    const foodData = {
        name: analysis.food_name,
        calories: analysis.calories,
        proteins: analysis.proteins,
        carbs: analysis.carbs,
        fats: analysis.fats,
        quantity: quantity
    };
    
    await addFoodEntry(foodData);
    elements.analysisResults.classList.add('hidden');
}

// Food management
async function handleManualFood(e) {
    e.preventDefault();
    
    const foodData = {
        name: document.getElementById('manualFoodName').value,
        calories: parseFloat(document.getElementById('manualFoodCalories').value),
        proteins: parseFloat(document.getElementById('manualFoodProteins').value),
        carbs: parseFloat(document.getElementById('manualFoodCarbs').value),
        fats: parseFloat(document.getElementById('manualFoodFats').value),
        quantity: parseFloat(document.getElementById('manualFoodQuantity').value)
    };
    
    await addFoodEntry(foodData);
    elements.manualFoodForm.reset();
    document.getElementById('manualFoodQuantity').value = 1;
}

async function addFoodEntry(foodData) {
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE_URL}/add-food`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(foodData)
        });
        
        if (response.ok) {
            showNotification('Alimento adicionado com sucesso!');
            await loadDailyData();
        } else {
            const data = await response.json();
            showNotification(data.detail || 'Erro ao adicionar alimento', 'error');
        }
    } catch (error) {
        showNotification('Erro de conexão', 'error');
    } finally {
        showLoading(false);
    }
}

function updateFoodsList() {
    if (!dailyData || !dailyData.foods) {
        elements.foodsList.innerHTML = '<p class="empty-state">Nenhum alimento registrado hoje</p>';
        return;
    }
    
    elements.foodsList.innerHTML = dailyData.foods.map(food => `
        <div class="food-item">
            <div class="item-info">
                <h4>${food.name}</h4>
                <p>Qtd: ${food.quantity} | P: ${(food.proteins * food.quantity).toFixed(1)}g | C: ${(food.carbs * food.quantity).toFixed(1)}g | G: ${(food.fats * food.quantity).toFixed(1)}g</p>
            </div>
            <div class="item-calories">
                ${Math.round(food.calories * food.quantity)} cal
            </div>
        </div>
    `).join('');
}

// Activity management
async function handleActivity(e) {
    e.preventDefault();
    
    const activityName = document.getElementById('activityName').value;
    const duration = parseInt(document.getElementById('activityDuration').value);
    
    // Calcular calorias baseado na atividade e duração
    const caloriesBurned = calculateActivityCalories(activityName, duration);
    
    const activityData = {
        name: activityName,
        duration_minutes: duration,
        calories_burned: caloriesBurned
    };
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE_URL}/add-activity`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(activityData)
        });
        
        if (response.ok) {
            showNotification('Atividade registrada com sucesso!');
            await loadDailyData();
            elements.activityForm.reset();
        } else {
            const data = await response.json();
            showNotification(data.detail || 'Erro ao registrar atividade', 'error');
        }
    } catch (error) {
        showNotification('Erro de conexão', 'error');
    } finally {
        showLoading(false);
    }
}

function calculateActivityCalories(activityName, durationMinutes) {
    // Calorias por minuto baseado no peso do usuário (assumindo 70kg se não disponível)
    const weight = currentUser?.weight || 70;
    
    const caloriesPerMinute = {
        'Caminhada': 0.05 * weight,
        'Corrida': 0.15 * weight,
        'Ciclismo': 0.12 * weight,
        'Natação': 0.14 * weight,
        'Musculação': 0.09 * weight,
        'Yoga': 0.04 * weight,
        'Dança': 0.08 * weight,
        'Futebol': 0.13 * weight,
        'Basquete': 0.12 * weight,
        'Tênis': 0.11 * weight
    };
    
    return Math.round((caloriesPerMinute[activityName] || 0.05 * weight) * durationMinutes);
}

function updateActivitiesList() {
    if (!dailyData || !dailyData.activities) {
        elements.activitiesList.innerHTML = '<p class="empty-state">Nenhuma atividade registrada hoje</p>';
        return;
    }
    
    elements.activitiesList.innerHTML = dailyData.activities.map(activity => `
        <div class="activity-item">
            <div class="item-info">
                <h4>${activity.name}</h4>
                <p>Duração: ${activity.duration_minutes} minutos</p>
            </div>
            <div class="item-calories">
                -${activity.calories_burned} cal
            </div>
        </div>
    `).join('');
}

// Date navigation
function changeDate(direction) {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + direction);
    currentDate = date.toISOString().split('T')[0];
    elements.selectedDate.value = currentDate;
    loadDailyData();
}

// Charts
function loadMacrosChart() {
    if (!dailyData) return;
    
    const ctx = document.getElementById('macrosChart');
    if (!ctx) return;
    
    // Destruir gráfico existente
    if (window.macrosChartInstance) {
        window.macrosChartInstance.destroy();
    }
    
    const { proteins, carbs, fats } = dailyData.macros;
    const total = proteins + carbs + fats;
    
    if (total === 0) {
        ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
        return;
    }
    
    window.macrosChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Proteínas', 'Carboidratos', 'Gorduras'],
            datasets: [{
                data: [proteins, carbs, fats],
                backgroundColor: [
                    '#4ecdc4',
                    '#45b7d1',
                    '#96ceb4'
                ],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

async function loadWeeklyChart() {
    try {
        const response = await fetch(`${API_BASE_URL}/weekly-summary`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const weeklyData = await response.json();
            renderWeeklyChart(weeklyData);
        }
    } catch (error) {
        console.error('Error loading weekly data:', error);
    }
}

function renderWeeklyChart(weeklyData) {
    const ctx = document.getElementById('weeklyChart');
    if (!ctx) return;
    
    // Destruir gráfico existente
    if (window.weeklyChartInstance) {
        window.weeklyChartInstance.destroy();
    }
    
    const dates = Object.keys(weeklyData.daily_data).sort();
    const consumedData = dates.map(date => weeklyData.daily_data[date].calories_consumed);
    const burnedData = dates.map(date => weeklyData.daily_data[date].calories_burned);
    const labels = dates.map(date => {
        const d = new Date(date);
        return d.toLocaleDateString('pt-BR', { weekday: 'short' });
    });
    
    window.weeklyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Consumidas',
                    data: consumedData,
                    backgroundColor: '#ff6b6b',
                    borderRadius: 4
                },
                {
                    label: 'Gastas',
                    data: burnedData,
                    backgroundColor: '#4ecdc4',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Profile functions
async function showProfile() {
    if (!currentUser) return;
    
    // Preencher dados do perfil
    document.getElementById('profileName').textContent = currentUser.name;
    document.getElementById('profileEmail').textContent = currentUser.email;
    document.getElementById('profileAge').textContent = `${currentUser.age} anos`;
    document.getElementById('profileWeight').textContent = `${currentUser.weight} kg`;
    document.getElementById('profileHeight').textContent = `${currentUser.height} cm`;
    document.getElementById('profileDailyCalories').textContent = `${Math.round(currentUser.daily_calories)} cal`;
    
    // Foto de perfil
    const modalProfilePhoto = document.getElementById('modalProfilePhoto');
    if (currentUser.profile_photo) {
        const img = document.createElement('img');
        img.src = `data:image/png;base64,${currentUser.profile_photo}`;
        modalProfilePhoto.innerHTML = '';
        modalProfilePhoto.appendChild(img);
    } else {
        modalProfilePhoto.innerHTML = '<i class="fas fa-user"></i>';
    }
    
    elements.profileModal.classList.add('active');
}

function closeProfile() {
    elements.profileModal.classList.remove('active');
}

async function handleProfilePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    showLoading(true);
    
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${API_BASE_URL}/upload-profile-photo`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });
        
        if (response.ok) {
            showNotification('Foto de perfil atualizada!');
            await loadUserProfile();
            
            // Atualizar foto no modal
            const modalProfilePhoto = document.getElementById('modalProfilePhoto');
            if (currentUser.profile_photo) {
                const img = document.createElement('img');
                img.src = `data:image/png;base64,${currentUser.profile_photo}`;
                modalProfilePhoto.innerHTML = '';
                modalProfilePhoto.appendChild(img);
            }
        } else {
            const data = await response.json();
            showNotification(data.detail || 'Erro ao enviar foto', 'error');
        }
    } catch (error) {
        showNotification('Erro de conexão', 'error');
    } finally {
        showLoading(false);
    }
}