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
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  collection,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * КОНФІГУРАЦІЯ FIREBASE
 */
const firebaseConfig = {
  apiKey: "AIzaSyAAhZnsJYbTkRPnzZfpc4Z0r2U_eEL7BFo",
  authDomain: "telephon-oblic-idalnya.firebaseapp.com",
  databaseURL: "https://telephon-oblic-idalnya-default-rtdb.firebaseio.com",
  projectId: "telephon-oblic-idalnya",
  storageBucket: "telephon-oblic-idalnya.firebasestorage.app",
  messagingSenderId: "591688369928",
  appId: "1:591688369928:web:09c8ef4ccdd474573a4ebd",
  measurementId: "G-4YY48P80V3",
};

// Ініціалізація продуктів Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// EMAIL ГОЛОВНОГО АДМІНІСТРАТОРА
const ADMIN_EMAIL = "sanya.djuice@ukr.net";

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
    this.unsubscribeAdminUsers = null;
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

const UI = {
  showToast(message) {
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
    if (state.unsubscribeAdminUsers) state.unsubscribeAdminUsers();
    await signOut(auth);
    location.reload();
  }
}

class UserService {
  static async checkProfile(user) {
    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
      state.userProfile = userDoc.data();

      // Автоматичне надання прав адміна за Email
      if (user.email === ADMIN_EMAIL && state.userProfile.role !== "admin") {
        state.userProfile.role = "admin";
        state.userProfile.isApproved = true;
        await updateDoc(userDocRef, { role: "admin", isApproved: true });
      }

      // Перевірка дозволу від адміністратора
      if (!state.userProfile.isApproved && state.userProfile.role !== "admin") {
        UI.toggleElement("authModal", true);
        UI.toggleElement("stepAuth", false);
        UI.toggleElement("stepProfile", false);
        UI.toggleElement("stepPendingApproval", true);
        UI.toggleElement("appContent", false);
        return;
      }

      UI.toggleElement("authModal", false);
      UI.toggleElement("appContent", true);
      const headerUser = document.getElementById("headerUserName");
      if (headerUser) {
        headerUser.textContent = `${state.userProfile.rank || ""} ${state.userProfile.fullName} (${state.userProfile.role === "admin" ? "АДМІН" : "Користувач"})`;
      }

      // Відображення панелі адміна
      if (state.userProfile.role === "admin") {
        UI.toggleElement("adminPanel", true);
        this.subscribeToAllUsersForAdmin();
      } else {
        UI.toggleElement("adminPanel", false);
      }

      await this.setUserOnlineStatus(user.uid, true);
      App.initMainView();
    } else {
      UI.toggleElement("stepAuth", false);
      UI.toggleElement("stepProfile", true);
    }
  }

  static async saveProfile(rank, fullName, unit) {
    if (!fullName) throw new Error("Прізвище та Ініціали є обов'язковими!");

    const isAdmin = state.currentUser.email === ADMIN_EMAIL;

    state.userProfile = {
      uid: state.currentUser.uid,
      email: state.currentUser.email,
      rank: rank || "солдат",
      fullName,
      unit: unit || "-",
      role: isAdmin ? "admin" : "client",
      isApproved: isAdmin,
      isOnline: true,
      lastSeen: new Date().toISOString(),
    };

    await setDoc(doc(db, "users", state.currentUser.uid), state.userProfile, {
      merge: true,
    });
    await this.checkProfile(state.currentUser);
  }

  static async setUserOnlineStatus(uid, isOnline) {
    try {
      const userRef = doc(db, "users", uid);
      await updateDoc(userRef, { isOnline, lastSeen: serverTimestamp() });
    } catch (e) {
      console.error("Помилка статусу:", e);
    }
  }

  static subscribeToAllUsersForAdmin() {
    const usersRef = collection(db, "users");
    state.unsubscribeAdminUsers = onSnapshot(usersRef, (snapshot) => {
      const adminTable = document.getElementById("adminUsersTable");
      if (!adminTable) return;

      adminTable.innerHTML = "";
      snapshot.forEach((docSnap) => {
        const u = docSnap.data();
        if (u.uid === state.currentUser.uid) return;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${UI.escapeHtml(u.rank)} ${UI.escapeHtml(u.fullName)}</td>
          <td>${UI.escapeHtml(u.email)}</td>
          <td>${UI.escapeHtml(u.unit)}</td>
          <td>${u.isApproved ? "🟢 Дозволено" : "⏳ Очікує"}</td>
          <td>
            ${!u.isApproved ? `<button class="btn btn-sm btn-success" onclick="approveUser('${u.uid}')">Надати дозвіл</button>` : ""}
            <button class="btn btn-sm btn-danger" onclick="deleteUser('${u.uid}')">Видалити</button>
          </td>
        `;
        adminTable.appendChild(tr);
      });
    });
  }

  static async approveUser(uid) {
    await updateDoc(doc(db, "users", uid), { isApproved: true });
    UI.showToast("Доступ користувачу надано!");
  }

  static async deleteUser(uid) {
    if (confirm("Ви дійсно бажаєте видалити цього користувача з системи?")) {
      await deleteDoc(doc(db, "users", uid));
      UI.showToast("Користувача видалено!");
    }
  }
}

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
      console.error("Помилка збереження:", err);
    }
  }
}

class App {
  static init() {
    this.bindEvents();
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        state.currentUser = user;
        await UserService.checkProfile(user);
      } else {
        UI.toggleElement("authModal", true);
        UI.toggleElement("stepAuth", true);
        UI.toggleElement("stepProfile", false);
        UI.toggleElement("stepPendingApproval", false);
        UI.toggleElement("appContent", false);
      }
    });
  }

  static bindEvents() {
    // Делегування подій для дій у таблиці (кнопки харчування, редагування, видалення)
    const tbody = document.getElementById("tableBody");
    if (tbody) {
      tbody.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;

        const action = btn.dataset.action;
        const idx = parseInt(btn.dataset.idx, 10);

        if (action === "toggleMeal") {
          const mealType = btn.dataset.meal;
          const list = state.getPersonnelForCurrentDate();
          if (list[idx]) {
            list[idx][mealType] =
              list[idx][mealType] === "Зарахувати"
                ? "Не зараховувати"
                : "Зарахувати";
            state.saveLocal();
            MealService.syncToFirestore(state.currentDate);
            App.renderTable();
          }
        } else if (action === "editPerson") {
          App.editPerson(idx);
        } else if (action === "removePerson") {
          App.removePerson(idx);
        }
      });
    }

    // Зміна підрозділу через фільтр
    const unitSelect = document.getElementById("unitFilter");
    if (unitSelect) {
      unitSelect.addEventListener("change", (e) => {
        state.selectedUnit = e.target.value;
        App.renderTable();
      });
    }

    // Оновлення статусу оффлайн при закритті/перезавантаженні сторінки
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

    const totalB = document.getElementById("totalBreakfast");
    const totalL = document.getElementById("totalLunch");
    const totalD = document.getElementById("totalDinner");

    if (totalB) totalB.innerText = countS;
    if (totalL) totalL.innerText = countO;
    if (totalD) totalD.innerText = countV;
  }

  static editPerson(index) {
    const list = state.getPersonnelForCurrentDate();
    const person = list[index];
    if (!person) return;

    const editIndexEl = document.getElementById("editIndex");
    const rankEl = document.getElementById("newRank");
    const nameEl = document.getElementById("newName");
    const unitEl = document.getElementById("newUnit");
    const saveBtn = document.getElementById("saveBtn");
    const cancelBtn = document.getElementById("cancelBtn");
    const formTitle = document.getElementById("formTitle");

    if (editIndexEl) editIndexEl.value = index;
    if (rankEl) rankEl.value = person.rank || "";
    if (nameEl) nameEl.value = person.name || "";
    if (unitEl) unitEl.value = person.unit || "";

    if (saveBtn) saveBtn.textContent = "Зберегти зміни";
    if (cancelBtn) cancelBtn.style.display = "inline-block";
    if (formTitle) formTitle.textContent = "✏️ Редагувати військовослужбовця";

    App.toggleForm(true);
  }

  static async removePerson(index) {
    const list = state.getPersonnelForCurrentDate();
    if (!list[index]) return;

    if (confirm(`Ви дійсно бажаєте видалити ${list[index].name}?`)) {
      list.splice(index, 1);
      state.setPersonnelForCurrentDate(list);
      await MealService.syncToFirestore(state.currentDate);
      App.updateUnitFilterOptions();
      App.renderTable();
    }
  }

  static toggleForm(forceOpen = false) {
    const content = document.getElementById("formContent");
    const icon = document.getElementById("toggleIcon");
    if (!content) return;
    const isHidden =
      content.style.display === "none" || content.style.display === "";
    if (isHidden || forceOpen) {
      content.style.display = "block";
      if (icon) icon.innerText = "➖";
    } else {
      content.style.display = "none";
      if (icon) icon.innerText = "➕";
    }
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

// Глобальні функції
window.loginUser = async () => {
  try {
    const email = document.getElementById("authEmail").value.trim();
    const pass = document.getElementById("authPassword").value.trim();
    await AuthService.login(email, pass);
  } catch (err) {
    UI.showToast(err.message);
  }
};

window.registerUser = async () => {
  try {
    const email = document.getElementById("authEmail").value.trim();
    const pass = document.getElementById("authPassword").value.trim();
    await AuthService.register(email, pass);
  } catch (err) {
    UI.showToast(err.message);
  }
};

window.saveProfile = async () => {
  try {
    const rank = document.getElementById("userRank").value.trim();
    const fullName = document.getElementById("userFullName").value.trim();
    const unit = document.getElementById("userUnit").value.trim();
    await UserService.saveProfile(rank, fullName, unit);
  } catch (err) {
    UI.showToast(err.message);
  }
};

window.approveUser = (uid) => UserService.approveUser(uid);
window.deleteUser = (uid) => UserService.deleteUser(uid);
window.logout = () => AuthService.logout();

// Зв'язування з HTML-подіями
window.onDateChange = () => App.handleDateChange();
window.toggleForm = (force) => App.toggleForm(force);
window.promptSearch = () => {
  const q = prompt("Введіть текст для пошуку:");
  if (q !== null) {
    state.searchQuery = q.toLowerCase().trim();
    App.renderTable();
  }
};
window.resetSearch = () => {
  state.searchQuery = "";
  App.renderTable();
};

document.addEventListener("DOMContentLoaded", () => App.init());
