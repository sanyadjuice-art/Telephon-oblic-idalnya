import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
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
 * КОНФІГУРАЦІЯ FIREBASE
 * Переконайтеся, що вставили ваш реальний apiKey замість тексту нижче
 */
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAAhZnsJYbTkRPnzZfpc4Z0r2U_eEL7BFo",
  authDomain: "telephon-oblic-idalnya.firebaseapp.com",
  projectId: "telephon-oblic-idalnya",
  storageBucket: "telephon-oblic-idalnya.firebasestorage.app",
  messagingSenderId: "591688369928",
  appId: "1:591688369928:web:89c8ef4ccdd474573a4ebd",
  measurementId: "G-4YY48P80V3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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
    this.unsubscribeMeals = null;
    this.unsubscribeUsers = null;
  }

  saveLocal() {
    localStorage.setItem("food_db_by_date", JSON.stringify(this.dbByDate));
  }

  getPersonnelForCurrentDate() {
    return this.dbByDate[this.currentDate] || [];
  }

  setPersonnelForCurrentDate(data) {
    this.dbByDate[this.currentDate] = data;
    this.saveLocal();
  }
}

const state = new AppState();

/**
 * ДОПОМІЖНІ МЕТОДИ ДЛЯ UI
 */
const UI = {
  showToast(message, type = "info") {
    alert(message);
  },
  toggleElement(id, show) {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? "block" : "none";
  },
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
 * СЕРВІС АВТОРИЗАЦІЇ (EMAIL / PASSWORD)
 */
class AuthService {
  static async login(email, password) {
    if (!email || !password) throw new Error("Заповніть Email та Пароль!");
    const result = await signInWithEmailAndPassword(auth, email, password);
    state.currentUser = result.user;
    return result.user;
  }

  static async register(email, password) {
    if (!email || password.length < 6)
      throw new Error("Пароль має бути не менше 6 символів!");
    const result = await createUserWithEmailAndPassword(auth, email, password);
    state.currentUser = result.user;
    return result.user;
  }

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
 * СЕРВІС КЕРУВАННЯ КОРИСТУВАЧАМИ
 */
class UserService {
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
      UI.toggleElement("stepAuth", false);
      UI.toggleElement("stepProfile", true);
    }
  }

  static async saveProfile(rank, fullName, unit) {
    if (!fullName) throw new Error("Прізвище та Ініціали є обов'язковими!");

    state.userProfile = {
      email: state.currentUser.email,
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

  static async setUserOnlineStatus(uid, isOnline) {
    try {
      const userRef = doc(db, "users", uid);
      await updateDoc(userRef, { isOnline, lastSeen: serverTimestamp() });
    } catch (e) {
      console.error("Помилка оновлення статусу:", e);
    }
  }

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
        `;
        listEl.appendChild(userRow);
      });

      if (countEl) countEl.innerText = onlineCount;
    });
  }
}

/**
 * СЕРВІС ОБЛІКУ ХАРЧУВАННЯ
 */
class MealService {
  static subscribeToMeals(dateStr, callback) {
    if (state.unsubscribeMeals) state.unsubscribeMeals();

    const docRef = doc(db, "meals", dateStr);
    state.unsubscribeMeals = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        state.setPersonnelForCurrentDate(docSnap.data().personnel || []);
      } else {
        MealService.initializeDefaultDateData(dateStr);
      }
      callback();
    });
  }

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
      ];
    }
    state.setPersonnelForCurrentDate(initialData);
    this.syncToFirestore(dateStr);
  }

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
    }
  }
}

/**
 * ГОЛОВНИЙ КОНТРОЛЕР ДОДАТКУ
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
        UI.toggleElement("authModal", true);
        UI.toggleElement("appContent", false);
      }
    });
  }

  static bindEvents() {
    window.addEventListener("beforeunload", () => {
      if (state.currentUser) {
        UserService.setUserOnlineStatus(state.currentUser.uid, false);
      }
    });
  }

  static initMainView() {
    const dateInput = document.getElementById("reportDate");
    if (dateInput) dateInput.value = state.currentDate;
    this.handleDateChange();
  }

  static handleDateChange() {
    const dateInput = document.getElementById("reportDate");
    if (dateInput && dateInput.value) state.currentDate = dateInput.value;
    MealService.subscribeToMeals(state.currentDate, () => {
      App.updateUnitFilterOptions();
      App.renderTable();
    });
  }

  static renderTable() {
    const tbody = document.getElementById("tableBody");
    if (!tbody) return;

    tbody.innerHTML = "";
    const list = [...state.getPersonnelForCurrentDate()];

    list.sort((a, b) => (a.unit || "").localeCompare(b.unit || "", "uk"));

    let filteredIdx = 0;
    let [countS, countO, countV] = [0, 0, 0];

    list.forEach((person, originalIndex) => {
      if (
        state.searchQuery &&
        !person.name.toLowerCase().includes(state.searchQuery) &&
        !person.unit.toLowerCase().includes(state.searchQuery)
      )
        return;
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
            <button class="btn-warning" data-action="editPerson" data-idx="${originalIndex}">✎</button>
            <button class="btn-danger" data-action="removePerson" data-idx="${originalIndex}">X</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById("totalBreakfast").innerText = countS;
    document.getElementById("totalLunch").innerText = countO;
    document.getElementById("totalDinner").innerText = countV;
  }

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
}

// Глобальні обробники дій
window.loginUser = async () => {
  try {
    const email = document.getElementById("authEmail").value.trim();
    const pass = document.getElementById("authPassword").value.trim();
    await AuthService.login(email, pass);
  } catch (err) {
    UI.showToast(err.message, "error");
  }
};

window.registerUser = async () => {
  try {
    const email = document.getElementById("authEmail").value.trim();
    const pass = document.getElementById("authPassword").value.trim();
    await AuthService.register(email, pass);
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

// Запуск після завантаження DOM
document.addEventListener("DOMContentLoaded", () => App.init());
