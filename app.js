import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  RecaptchaVerifier, 
  signInWithPhoneNumber, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Валідна конфігурація Firebase
const firebaseConfig = {
  apiKey: "AIzaSyD-EXAMPLE_KEY_REPLACE_WITH_YOURS",
  authDomain: "phonebook-app.firebaseapp.com",
  projectId: "phonebook-app",
  storageBucket: "phonebook-app.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:4573b4ebd123456"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

auth.languageCode = 'uk';

let confirmationResult = null;
let allData = [];

window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('recaptcha-container')) {
    window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      'size': 'invisible',
      'callback': (response) => {}
    });
  }
});

// Авторизація за номером телефону
window.sendSMS = function() {
  const phoneNumber = document.getElementById('phoneNumber')?.value || document.getElementById('phone-number')?.value;
  if (!phoneNumber) {
    alert("Будь ласка, введіть номер телефону");
    return;
  }

  const appVerifier = window.recaptchaVerifier;
  signInWithPhoneNumber(auth, phoneNumber, appVerifier)
    .then((result) => {
      confirmationResult = result;
      window.confirmationResult = result;
      alert("SMS з кодом надіслано!");
    })
    .catch((error) => {
      console.error("Помилка відправки SMS:", error);
      alert("Помилка надсилання SMS: " + error.message);
    });
};

window.verifyCode = function() {
  const code = document.getElementById('smsCode')?.value || document.getElementById('verification-code')?.value;
  if (!code) {
    alert("Введіть код з SMS");
    return;
  }

  const activeConfirmation = confirmationResult || window.confirmationResult;
  if (!activeConfirmation) {
    alert("Спочатку запросіть код підтвердження");
    return;
  }

  activeConfirmation.confirm(code)
    .then((result) => {
      const user = result.user;
      alert("Успішна авторизація!");
      console.log("User logged in:", user);
    })
    .catch((error) => {
      console.error("Помилка перевірки коду:", error);
      alert("Невірний код підтвердження");
    });
};

window.logout = function() {
  signOut(auth).then(() => {
    alert("Ви вийшли з системи");
  });
};

// Робота з базами даних Firestore
async function loadData() {
  try {
    const querySnapshot = await getDocs(collection(db, "contacts"));
    allData = [];
    querySnapshot.forEach((docSnap) => {
      allData.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderTable();
    updateDatalists();
  } catch (e) {
    console.error("Помилка завантаження даних: ", e);
  }
}

function renderTable() {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  allData.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.rank || ''}</td>
      <td>${item.name || ''}</td>
      <td>${item.unit || ''}</td>
      <td>${item.phone || ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

function updateDatalists() {
  const ranks = [...new Set(allData.map(i => i.rank).filter(Boolean))];
  const units = [...new Set(allData.map(i => i.unit).filter(Boolean))];

  populateDatalist('ranksList', ranks);
  populateDatalist('unitsList', units);
  populateDatalist('authRanksList', ranks);
  populateDatalist('authUnitsList', units);
}

function populateDatalist(elementId, items) {
  const list = document.getElementById(elementId);
  if (!list) return;
  list.innerHTML = '';
  items.forEach(item => {
    const option = document.createElement('option');
    option.value = item;
    list.appendChild(option);
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    loadData();
  }
});