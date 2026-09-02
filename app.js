// Конфігурація Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAAhZnsJYbTkRPnzZfpc4Z0r2U_eEL7BFo",
  authDomain: "telephon-oblic-idalnya.firebaseapp.com",
  projectId: "telephon-oblic-idalnya",
  storageBucket: "telephon-oblic-idalnya.firebasestorage.app",
  messagingSenderId: "591688369928",
  appId: "1:591688369928:web:89c8ef4ccdd474573a4ebd",
  measurementId: "G-4YY48P80V3",
};

// Ініціалізація Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Налаштування мови SMS
auth.languageCode = "uk";

window.onload = function () {
  // Налаштування невидимої reCAPTCHA
  window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier(
    "recaptcha-container",
    {
      size: "invisible",
      callback: (response) => {
        // reCAPTCHA пройдена
      },
    },
  );

  document.getElementById("send-code-btn").addEventListener("click", sendSMS);
  document
    .getElementById("verify-code-btn")
    .addEventListener("click", verifySMS);
};

function sendSMS() {
  const phoneNumber = document.getElementById("phone-number").value.trim();
  const appVerifier = window.recaptchaVerifier;

  auth
    .signInWithPhoneNumber(phoneNumber, appVerifier)
    .then((confirmationResult) => {
      window.confirmationResult = confirmationResult;
      document.getElementById("auth-container").style.display = "none";
      document.getElementById("verification-container").style.display = "block";
      alert("SMS-код відправлено!");
    })
    .catch((error) => {
      console.error("Помилка відправки SMS:", error);
      alert("Помилка відправки SMS: " + error.message);
      // Скидання капчі при помилці
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier
          .render()
          .then((widgetId) => grecaptcha.reset(widgetId));
      }
    });
}

function verifySMS() {
  const code = document.getElementById("verification-code").value.trim();

  window.confirmationResult
    .confirm(code)
    .then((result) => {
      const user = result.user;
      alert("Успішна авторизація! UID: " + user.uid);
      // Тут логіка перенаправлення або завантаження даних
    })
    .catch((error) => {
      console.error("Помилка перевірки коду:", error);
      alert("Невірний код підтвердження.");
    });
}
