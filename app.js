import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  collection,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * КОНФІГУРАЦІЯ ТА ІНІЦІАЛІЗАЦІЯ FIREBASE
 */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "telephon-oblic-idalnya.firebaseapp.com",
  projectId: "telephon-oblic-idalnya",
  storageBucket: "telephon-oblic-idalnya.firebasestorage.app",
  messagingSenderId: "591688369928",
  appId: "1:591688369928:web:89c0ef4ccdd474573s4ebd",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
auth.languageCode = "uk";

/**
 * КЛАС КЕРУВАННЯ СТАНОМ ДОДАТКУ (STATE MANAGEMENT)
 */
class AppState {
  constructor() {
    this.currentUser = null;
    this.userProfile = null;
    this.currentDate = new Date().toISOString().split("T")[0];
    this.dbByDate = JSON.parse(localStorage.getItem("food_db_by_date")) || {};
    this.searchQuery = "";
    this.selectedUnit = "ALL";
    this.confirmationResult = null;
    this.unsubscribeMeals = null;
    this.unsubscribeUsers = null;
  }

  // Збереження даних у локальне сховище
  saveLocal() {
    localStorage.setItem("food_db_by_date", JSON.stringify(this.dbByDate));
  }

  // Отримання списку особового складу на поточну дату
  getPersonnelForCurrentDate() {
    return this.dbByDate[this.currentDate] || [];
  }

  // Оновлення списку особового складу на поточну дату
  setPersonnelForCurrentDate(data) {
    this.dbByDate[this.currentDate] = data;
    this.saveLocal();
  }
}

const state = new AppState();

/**
 * ДОПОМІЖНІ МЕТОДИ ДЛЯ РОБОТИ З UI ТА БЕЗПЕКОЮ
 */
const UI = {
  // Відображення сповіщень користувачеві
  showToast(message, type = "info") {
    console.log(`[${type.toUpperCase()}] ${message}`);
    alert(message);
  },

  // Перемикання видимості DOM-елементів
  toggleElement(id, show) {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? "block" : "none";
  },

  // Захист від XSS ін'єкцій при відображенні тексту
  escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (match) => {
      const escapeMap = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return escapeMap[match];
    });
  },
};

/**
 * СЕРВІС АВТОРИЗАЦІЇ (AUTHENTICATION SERVICE)
 */
class AuthService {
  // Ініціалізація невидимого reCAPTCHA
  static initRecaptcha() {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(
        auth,
        "recaptcha-container",
        {
          size: "invisible",
          callback: () => {},
        },
      );
    }
  }

  // Надсилання SMS-коду на вказаний номер
  static async sendSMS(phoneNumber) {
    if (!phoneNumber.startsWith("+380") || phoneNumber.length < 13) {
      throw new Error("Введіть коректний номер у форматі +380XXXXXXXXX");
    }
    this.initRecaptcha();
    state.confirmationResult = await signInWithPhoneNumber(
      auth,
      phoneNumber,
      window.recaptchaVerifier,
    );
  }

  // Перевірка SMS-коду
  static async verifyCode(code) {
    if (!code || code.length !== 6) {
      throw new Error("Код підтвердження повинен містити 6 цифр.");
    }
    if (!state.confirmationResult) {
      throw new Error("Сесія авторизації застаріла. Запишіть SMS знову.");
    }
    const result = await state.confirmationResult.confirm(code);
    state.currentUser = result.user;
    return result.user;
  }

  // Вихід із системи
  static async logout() {
    if (state.currentUser) {
      await UserService.setUserOnlineStatus(state.currentUser.uid, false);
    }
    if (state.unsubscribeMeals) state.unsubscribeMeals();
    if (state.unsubscribeUsers) state.unsubscribeUsers();
    await signOut(auth);
    location.reload();
  }
}

/**
 * СЕРВІС КЕРУВАННЯ КОРИСТУВАЧАМИ (USER SERVICE)
 */
class UserService {
  // Перевірка наявності профілю користувача у базі даних
  static async checkProfile(user) {
    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists() && userDoc.data().fullName) {
      state.userProfile = userDoc.data();
      UI.toggleElement("authModal", false);
      UI.toggleElement("appContent", true);
      document.getElementById("headerUserName").textContent =
        `${state.userProfile.rank || ""} ${state.userProfile.fullName}`;

      await this.setUserOnlineStatus(user.uid, true);
      App.initMainView();
    } else {
      document.getElementById("stepPhone").style.display = "none";
      document.getElementById("stepCode").style.display = "none";
      document.getElementById("stepProfile").style.display = "block";
    }
  }

  // Збереження нового профілю користувача
  static async saveProfile(rank, fullName, unit) {
    if (!fullName) throw new Error("Прізвище та Ініціали є обов'язковими!");

    state.userProfile = {
      phone: state.currentUser.phoneNumber,
      rank: rank || "солдат",
      fullName,
      unit: unit || "-",
      role: "client",
      isOnline: true,
      lastSeen: new Date().toISOString(),
    };

    await setDoc(doc(db, "users", state.currentUser.uid), state.userProfile, {
      merge: true,
    });

    UI.toggleElement("authModal", false);
    UI.toggleElement("appContent", true);
    document.getElementById("headerUserName").textContent =
      `${state.userProfile.rank} ${state.userProfile.fullName}`;

    await this.setUserOnlineStatus(state.currentUser.uid, true);
    App.initMainView();
  }

  // Оновлення мережевого статусу (онлайн/офлайн)
  static async setUserOnlineStatus(uid, isOnline) {
    try {
      const userRef = doc(db, "users", uid);
      await updateDoc(userRef, {
        isOnline,
        lastSeen: serverTimestamp(),
      });
    } catch (e) {
      console.error("Помилка оновлення статусу присутності:", e);
    }
  }

  // Відстеження активних користувачів у реальному часі
  static subscribeToOnlineUsers() {
    const usersRef = collection(db, "users");
    state.unsubscribeUsers = onSnapshot(usersRef, (snapshot) => {
      const listEl = document.getElementById("onlineUsersList");
      const countEl = document.getElementById("onlineCount");
      if (!listEl) return;

      listEl.innerHTML = "";
      let onlineCount = 0;

      snapshot.forEach((docSnap) => {
        const userData = docSnap.data();
        if (userData.isOnline) onlineCount++;

        const userRow = document.createElement("div");
        userRow.className = "online-user-item";
        userRow.innerHTML = `
          <span>${userData.isOnline ? "🟢" : "🔴"} <strong>${UI.escapeHtml(userData.rank)} ${UI.escapeHtml(userData.fullName)}</strong> (${UI.escapeHtml(userData.unit)})</span>
          <span style="font-size: 11px; color: #64748b;">${UI.escapeHtml(userData.phone)}</span>
        `;
        listEl.appendChild(userRow);
      });

      if (countEl) countEl.innerText = onlineCount;
    });
  }
}

/**
 * СЕРВІС ОБЛІКУ ХАРЧУВАННЯ (MEAL SERVICE)
 */
class MealService {
  // Підписка на оновлення даних харчування в реальному часі
  static subscribeToMeals(dateStr, callback) {
    if (state.unsubscribeMeals) state.unsubscribeMeals();

    const docRef = doc(db, "meals", dateStr);
    state.unsubscribeMeals = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          state.setPersonnelForCurrentDate(docSnap.data().personnel || []);
        } else {
          MealService.initializeDefaultDateData(dateStr);
        }
        callback();
      },
      (error) => {
        console.error("Помилка підписки на дані Firestore:", error);
      },
    );
  }

  // Ініціалізація початкових даних для нової дати
  static initializeDefaultDateData(dateStr) {
    const dates = Object.keys(state.dbByDate).sort();
    let initialData = [];
    if (dates.length > 0) {
      const lastDate = dates[dates.length - 1];
      initialData = state.dbByDate[lastDate].map((p) => ({
        ...p,
        s: "Не зараховувати",
        o: "Не зараховувати",
        v: "Не зараховувати",
      }));
    } else {
      initialData = [
        {
          rank: "солдат",
          name: "Іваненко І.І.",
          unit: "1-ша рота",
          s: "Не зараховувати",
          o: "Не зараховувати",
          v: "Не зараховувати",
        },
        {
          rank: "старший солдат",
          name: "Петренко П.П.",
          unit: "2-га рота",
          s: "Не зараховувати",
          o: "Не зараховувати",
          v: "Не зараховувати",
        },
      ];
    }
    state.setPersonnelForCurrentDate(initialData);
    this.syncToFirestore(dateStr);
  }

  // Синхронізація локальних даних із хмарною базой Firestore
  static async syncToFirestore(dateStr) {
    try {
      const docRef = doc(db, "meals", dateStr);
      await setDoc(
        docRef,
        {
          personnel: state.getPersonnelForCurrentDate(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
    } catch (err) {
      console.error("Помилка збереження в Firestore:", err);
      UI.showToast("Не вдалося синхронізувати хмарні дані.", "error");
    }
  }
}

/**
 * ГОЛОВНИЙ КОНТРОЛЕР ДОДАТКУ (MAIN APPLICATION CONTROLLER)
 */
class App {
  static init() {
    this.bindEvents();
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        state.currentUser = user;
        await UserService.checkProfile(user);
        UserService.subscribeToOnlineUsers();
      } else {
        document.getElementById("authModal").style.display = "flex";
        document.getElementById("appContent").style.display = "none";
      }
    });
  }

  // Прив'язка глобальних подій (наприклад, перед закриттям сторінки)
  static bindEvents() {
    window.addEventListener("beforeunload", () => {
      if (state.currentUser) {
        UserService.setUserOnlineStatus(state.currentUser.uid, false);
      }
    });
  }

  // Ініціалізація головного інтерфейсу
  static initMainView() {
    const dateInput = document.getElementById("reportDate");
    if (dateInput) {
      dateInput.value = state.currentDate;
    }
    this.handleDateChange();
  }

  // Обробка зміни дати звіту
  static handleDateChange() {
    const dateInput = document.getElementById("reportDate");
    if (dateInput && dateInput.value) {
      state.currentDate = dateInput.value;
    }
    MealService.subscribeToMeals(state.currentDate, () => {
      App.updateUnitFilterOptions();
      App.renderTable();
    });
  }

  // Рендеринг таблиці особового складу
  static renderTable() {
    const tbody = document.getElementById("tableBody");
    if (!tbody) return;

    tbody.innerHTML = "";
    const list = [...state.getPersonnelForCurrentDate()];

    // Сортування за підрозділом та ПІБ
    list.sort((a, b) => {
      const unitCmp = (a.unit || "").localeCompare(b.unit || "", "uk");
      return unitCmp !== 0
        ? unitCmp
        : (a.name || "").localeCompare(b.name || "", "uk");
    });

    this.updateDatalists(list);

    let filteredIdx = 0;
    let [countS, countO, countV] = [0, 0, 0];

    list.forEach((person, originalIndex) => {
      if (
        state.searchQuery &&
        !person.name.toLowerCase().includes(state.searchQuery) &&
        !person.unit.toLowerCase().includes(state.searchQuery)
      ) {
        return;
      }
      if (state.selectedUnit !== "ALL" && person.unit !== state.selectedUnit)
        return;

      filteredIdx++;
      const sActive = person.s === "Зарахувати";
      const oActive = person.o === "Зарахувати";
      const vActive = person.v === "Зарахувати";

      if (sActive) countS++;
      if (oActive) countO++;
      if (vActive) countV++;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${filteredIdx}</td>
        <td>${UI.escapeHtml(person.rank)}</td>
        <td style="text-align: left; font-weight: 600;">${UI.escapeHtml(person.name)}</td>
        <td>${UI.escapeHtml(person.unit)}</td>
        <td><button class="btn-meal ${sActive ? "active" : "inactive"}" data-action="toggleMeal" data-idx="${originalIndex}" data-meal="s">${sActive ? "Зарахований" : "Незарахований"}</button></td>
        <td><button class="btn-meal ${oActive ? "active" : "inactive"}" data-action="toggleMeal" data-idx="${originalIndex}" data-meal="o">${oActive ? "Зарахований" : "Незарахований"}</button></td>
        <td><button class="btn-meal ${vActive ? "active" : "inactive"}" data-action="toggleMeal" data-idx="${originalIndex}" data-meal="v">${vActive ? "Зарахований" : "Незарахований"}</button></td>
        <td>
          <div class="action-buttons">
            <button class="btn-warning" data-action="editPerson" data-idx="${originalIndex}" title="Редагувати">✎</button>
            <button class="btn-danger" data-action="removePerson" data-idx="${originalIndex}" title="Видалити">X</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById("totalBreakfast").innerText = countS;
    document.getElementById("totalLunch").innerText = countO;
    document.getElementById("totalDinner").innerText = countV;
  }

  // Оновлення списку вибору підрозділів у фільтрі
  static updateUnitFilterOptions() {
    const select = document.getElementById("unitFilter");
    if (!select) return;

    const currentVal = select.value;
    const units = new Set(
      state
        .getPersonnelForCurrentDate()
        .map((p) => p.unit)
        .filter((u) => u && u !== "-"),
    );

    select.innerHTML = `<option value="ALL">Всі підрозділи</option>`;
    Array.from(units)
      .sort()
      .forEach((u) => {
        select.innerHTML += `<option value="${UI.escapeHtml(u)}">${UI.escapeHtml(u)}</option>`;
      });

    select.value = units.has(currentVal) ? currentVal : "ALL";
    state.selectedUnit = select.value;
  }

  // Динамічне заповнення випадаючих автопідказок (datalists)
  static updateDatalists(personnel) {
    const ranks = new Set([
      "солдат",
      "старший солдат",
      "сержант",
      "лейтенант",
      "капітан",
      "майор",
    ]);
    const units = new Set();

    personnel.forEach((p) => {
      if (p.rank) ranks.add(p.rank);
      if (p.unit && p.unit !== "-") units.add(p.unit);
    });

    const populate = (id, items) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = Array.from(items)
        .sort()
        .map((i) => `<option value="${UI.escapeHtml(i)}">`)
        .join("");
    };

    populate("ranksList", ranks);
    populate("unitsList", units);
    populate("authRanksList", ranks);
    populate("authUnitsList", units);
  }
}

/**
 * ГЛОБАЛЬНІ МЕТОДИ ДЛЯ ВЗАЄМОДІЇ З UI (WINDOW BINDING)
 */
window.sendSMS = async () => {
  try {
    const phone = document.getElementById("phoneNumber")?.value.trim();
    await AuthService.sendSMS(phone);
    UI.toggleElement("stepPhone", false);
    UI.toggleElement("stepCode", true);
  } catch (err) {
    UI.showToast(err.message, "error");
  }
};

window.verifyCode = async () => {
  try {
    const code = document.getElementById("smsCode")?.value.trim();
    await AuthService.verifyCode(code);
  } catch (err) {
    UI.showToast(err.message, "error");
  }
};

window.saveProfile = async () => {
  try {
    const rank = document.getElementById("userRank").value.trim();
    const fullName = document.getElementById("userFullName").value.trim();
    const unit = document.getElementById("userUnit").value.trim();
    await UserService.saveProfile(rank, fullName, unit);
  } catch (err) {
    UI.showToast(err.message, "error");
  }
};

window.logout = () => AuthService.logout();
window.onDateChange = () => App.handleDateChange();

// Перемикання статусу харчування (Сніданок/Обід/Вечеря)
window.toggleMeal = (index, mealType) => {
  const list = state.getPersonnelForCurrentDate();
  if (list[index]) {
    list[index][mealType] =
      list[index][mealType] === "Зарахувати" ? "Не зараховувати" : "Зарахувати";
    state.saveLocal();
    MealService.syncToFirestore(state.currentDate);
    App.renderTable();
  }
};

// Збереження або редагування запису про військовослужбовця
window.savePerson = () => {
  const rank = document.getElementById("newRank").value.trim();
  const name = document.getElementById("newName").value.trim();
  const unit = document.getElementById("newUnit").value.trim();
  const editIndex = parseInt(document.getElementById("editIndex").value, 10);

  if (!name) return UI.showToast("Вкажіть прізвище!", "warning");

  const list = state.getPersonnelForCurrentDate();
  if (editIndex === -1) {
    list.push({
      rank: rank || "солдат",
      name,
      unit: unit || "-",
      s: "Не зараховувати",
      o: "Не зараховувати",
      v: "Не зараховувати",
    });
  } else {
    list[editIndex] = {
      ...list[editIndex],
      rank: rank || "солдат",
      name,
      unit: unit || "-",
    };
  }

  state.saveLocal();
  MealService.syncToFirestore(state.currentDate);
  window.resetForm();
  App.updateUnitFilterOptions();
  App.renderTable();
};

// Перехід у режим редагування картки
window.editPerson = (index) => {
  const p = state.getPersonnelForCurrentDate()[index];
  if (!p) return;
  document.getElementById("newRank").value = p.rank;
  document.getElementById("newName").value = p.name;
  document.getElementById("newUnit").value = p.unit;
  document.getElementById("editIndex").value = index;

  document.getElementById("formTitle").textContent =
    "✏️ Редагувати військовослужбовця";
  document.getElementById("saveBtn").textContent = "Зберегти зміни";
  UI.toggleElement("cancelBtn", true);
  window.toggleForm(true);
};

// Видалення військовослужбовця зі списку
window.removePerson = (index) => {
  if (confirm("Видалити військовослужбовця?")) {
    const list = state.getPersonnelForCurrentDate();
    list.splice(index, 1);
    state.saveLocal();
    MealService.syncToFirestore(state.currentDate);
    App.renderTable();
  }
};

// Скидання форми додавання/редагування
window.resetForm = () => {
  document.getElementById("newRank").value = "";
  document.getElementById("newName").value = "";
  document.getElementById("newUnit").value = "";
  document.getElementById("editIndex").value = "-1";
  document.getElementById("formTitle").textContent =
    "➕ Додати нового військовослужбовця";
  document.getElementById("saveBtn").textContent = "Додати до списку";
  UI.toggleElement("cancelBtn", false);
  window.toggleForm(false);
};

// Перемикання відображення форми
window.toggleForm = (forceOpen = false) => {
  const content = document.getElementById("formContent");
  if (!content) return;
  const isHidden = content.style.display === "none" || !content.style.display;
  UI.toggleElement("formContent", forceOpen || isHidden);
};

// Діалог пошуку військовослужбовців
window.promptSearch = () => {
  const query = prompt("Введіть прізвище або підрозділ:");
  if (query !== null) {
    state.searchQuery = query.toLowerCase().trim();
    UI.toggleElement("resetSearchBtn", Boolean(state.searchQuery));
    App.renderTable();
  }
};

// Скидання параметрів пошуку
window.resetSearch = () => {
  state.searchQuery = "";
  UI.toggleElement("resetSearchBtn", false);
  App.renderTable();
};

// Перемикання панелі активних користувачів онлайн
window.toggleOnlinePanel = () => {
  const list = document.getElementById("onlineUsersList");
  if (list) {
    const isHidden = list.style.display === "none";
    list.style.display = isHidden ? "block" : "none";
    document.getElementById("onlineToggleIcon").textContent = isHidden
      ? "➖"
      : "➕";
  }
};

// Експорт даних у формат Excel (.xlsx)
window.exportToExcel = () => {
  const list = [...state.getPersonnelForCurrentDate()];
  const excelData = [
    [`ЗВІТ ПРО ФАКТИЧНЕ ХАРЧУВАННЯ ЗА ДАТУ: ${state.currentDate}`],
    [],
    [
      "№ п/п",
      "Військове звання",
      "Прізвище",
      "Підрозділ",
      "Сніданок",
      "Обід",
      "Вечеря",
    ],
  ];

  list.forEach((p, idx) => {
    excelData.push([idx + 1, p.rank, p.name, p.unit, p.s, p.o, p.v]);
  });

  const ws = XLSX.utils.aoa_to_sheet(excelData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Звіт");
  XLSX.writeFile(wb, `Meal_Report_${state.currentDate}.xlsx`);
};

// Делегування подій для дій у таблиці (Event Delegation)
document.addEventListener("click", (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  const idx = parseInt(target.dataset.idx, 10);

  if (action === "toggleMeal") {
    window.toggleMeal(idx, target.dataset.meal);
  } else if (action === "editPerson") {
    window.editPerson(idx);
  } else if (action === "removePerson") {
    window.removePerson(idx);
  }
});

// Старт додатку після завантаження DOM
document.addEventListener("DOMContentLoaded", () => App.init());
