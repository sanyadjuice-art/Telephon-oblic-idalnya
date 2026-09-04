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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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
    if (str === null || str === undefined || str === "") return "-";
    return String(str).replace(/[&<>"']/g, (match) => {
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

      if (user.email === ADMIN_EMAIL && state.userProfile.role !== "admin") {
        state.userProfile.role = "admin";
        state.userProfile.isApproved = true;
        await updateDoc(userDocRef, { role: "admin", isApproved: true });
      }

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

      if (state.userProfile.role === "admin") {
        UI.toggleElement("adminPanel", true);
        this.subscribeToAllUsersForAdmin();
      } else {
        UI.toggleElement("adminPanel", false);
      }

      this.subscribeToOnlineUsers();
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

  static subscribeToOnlineUsers() {
    const usersRef = collection(db, "users");
    state.unsubscribeUsers = onSnapshot(usersRef, (snapshot) => {
      const listEl = document.getElementById("onlineUsersList");
      const countEl = document.getElementById("onlineCount");
      if (!listEl) return;

      let count = 0;
      listEl.innerHTML = "";
      snapshot.forEach((docSnap) => {
        const u = docSnap.data();
        if (u.isOnline) {
          count++;
          const item = document.createElement("div");
          item.style.padding = "2px 0";
          item.innerHTML = `🟢 ${UI.escapeHtml(u.rank)} ${UI.escapeHtml(u.fullName)} (${UI.escapeHtml(u.unit)})`;
          listEl.appendChild(item);
        }
      });
      if (countEl) countEl.innerText = count;
    });
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
    try {
      await updateDoc(doc(db, "users", uid), { isApproved: true });
      UI.showToast("Доступ користувачу надано!");
    } catch (e) {
      console.error("Помилка надання доступу:", e);
      UI.showToast("Помилка надання доступу");
    }
  }

  static async deleteUser(uid) {
    if (confirm("Ви дійсно бажаєте видалити цього користувача з системи?")) {
      try {
        await deleteDoc(doc(db, "users", uid));
        UI.showToast("Профіль користувача успішно видалено з Firestore!");
      } catch (e) {
        console.error("Помилка при видаленні:", e);
        UI.showToast("Помилка видалення!");
      }
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
        rank: p.rank || "солдат",
        name: p.name || p.fullName || "Без імені",
        unit: p.unit || "-",
        s: "Не зараховувати",
        o: "Не зараховувати",
        v: "Не зараховувати",
      }));
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

    const unitSelect = document.getElementById("unitFilter");
    if (unitSelect) {
      unitSelect.addEventListener("change", (e) => {
        state.selectedUnit = e.target.value;
        App.renderTable();
      });
    }

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

    // Отримуємо початковий масив із збереженням оригінальних індексів
    const originalList = state.getPersonnelForCurrentDate();

    // Створюємо масив об'єктів разом з їх початковими індексами
    const indexedList = originalList.map((person, index) => ({
      person,
      originalIndex: index,
    }));

    // Сортуємо копію за підрозділом для відображення
    indexedList.sort((a, b) =>
      (a.person.unit || "").localeCompare(b.person.unit || "", "uk"),
    );

    let filteredIdx = 0;
    let [countS, countO, countV] = [0, 0, 0];

    indexedList.forEach(({ person, originalIndex }) => {
      const personName = person.name || person.fullName || "";
      const personRank = person.rank || "-";
      const personUnit = person.unit || "-";

      // Фільтрація по пошуку та підрозділу
      if (
        state.searchQuery &&
        !personName.toLowerCase().includes(state.searchQuery) &&
        !personUnit.toLowerCase().includes(state.searchQuery)
      )
        return;
      if (state.selectedUnit !== "ALL" && personUnit !== state.selectedUnit)
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
      <td>${UI.escapeHtml(personRank)}</td>
      <td style="text-align: left; font-weight: 600;">${UI.escapeHtml(personName)}</td>
      <td>${UI.escapeHtml(personUnit)}</td>
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

    const resetBtn = document.getElementById("resetSearchBtn");
    if (resetBtn)
      resetBtn.style.display = state.searchQuery ? "inline-block" : "none";
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
    if (nameEl) nameEl.value = person.name || person.fullName || "";
    if (unitEl) unitEl.value = person.unit || "";

    if (saveBtn) saveBtn.textContent = "Зберегти зміни";
    if (cancelBtn) cancelBtn.style.display = "inline-block";
    if (formTitle) formTitle.textContent = "✏️ Редагувати військовослужбовця";

    App.toggleForm(true);
  }

  static async savePerson() {
    const editIndexEl = document.getElementById("editIndex");
    const rankEl = document.getElementById("newRank");
    const nameEl = document.getElementById("newName");
    const unitEl = document.getElementById("newUnit");

    const idx = parseInt(editIndexEl.value, 10);
    const name = nameEl.value.trim();
    const rank = rankEl.value.trim() || "солдат";
    const unit = unitEl.value.trim() || "-";

    if (!name) {
      UI.showToast("Вкажіть Прізвище та ініціали!");
      return;
    }

    const list = state.getPersonnelForCurrentDate();

    if (idx >= 0 && list[idx]) {
      list[idx].name = name;
      list[idx].rank = rank;
      list[idx].unit = unit;
    } else {
      list.push({
        rank,
        name,
        unit,
        s: "Не зараховувати",
        o: "Не зараховувати",
        v: "Не зараховувати",
      });
    }

    state.setPersonnelForCurrentDate(list);
    await MealService.syncToFirestore(state.currentDate);
    App.resetForm();
    App.updateUnitFilterOptions();
    App.renderTable();
  }

  static resetForm() {
    const editIndexEl = document.getElementById("editIndex");
    const rankEl = document.getElementById("newRank");
    const nameEl = document.getElementById("newName");
    const unitEl = document.getElementById("newUnit");
    const saveBtn = document.getElementById("saveBtn");
    const cancelBtn = document.getElementById("cancelBtn");
    const formTitle = document.getElementById("formTitle");

    if (editIndexEl) editIndexEl.value = "-1";
    if (rankEl) rankEl.value = "";
    if (nameEl) nameEl.value = "";
    if (unitEl) unitEl.value = "";

    if (saveBtn) saveBtn.textContent = "Додати до списку";
    if (cancelBtn) cancelBtn.style.display = "none";
    if (formTitle)
      formTitle.textContent = "➕ Додати нового військовослужбовця";
  }

  static async removePerson(index) {
    const list = state.getPersonnelForCurrentDate();
    if (!list[index]) return;

    const personName =
      list[index].name || list[index].fullName || "військовослужбовця";

    if (confirm(`Ви дійсно бажаєте видалити ${personName}?`)) {
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

// Глобальні функції для прив'язки до HTML
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

window.onDateChange = () => App.handleDateChange();
window.toggleForm = (force) => App.toggleForm(force);
window.savePerson = () => App.savePerson();
window.resetForm = () => App.resetForm();

window.toggleOnlinePanel = () => {
  const list = document.getElementById("onlineUsersList");
  const icon = document.getElementById("onlineToggleIcon");
  if (!list) return;
  if (list.style.display === "none") {
    list.style.display = "block";
    if (icon) icon.innerText = "➖";
  } else {
    list.style.display = "none";
    if (icon) icon.innerText = "➕";
  }
};

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

window.exportToExcel = () => {
  if (typeof XLSX === "undefined") {
    UI.showToast("Бібліотека XLSX не завантажена!");
    return;
  }
  const data = state.getPersonnelForCurrentDate().map((p, idx) => ({
    "№": idx + 1,
    Звання: p.rank || "-",
    ПІБ: p.name || p.fullName || "-",
    Підрозділ: p.unit || "-",
    Сніданок: p.s || "Не зараховувати",
    Обід: p.o || "Не зараховувати",
    Вечеря: p.v || "Не зараховувати",
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Звіт");
  XLSX.writeFile(workbook, `Харчування_${state.currentDate}.xlsx`);
};

// Глобальний словник для розпізнавання та стандартизації скорочень звань
if (!window.rankDictionary) {
  window.rankDictionary = {
    "солд.": "солдат",
    солд: "солдат",
    "ст. солд.": "старший солдат",
    "ст.солд": "старший солдат",
    "мол. с-нт": "молодший сержант",
    "с-нт": "сержант",
    "ст. с-нт": "старший сержант",
    "головний с-нт": "головний сержант",
    "штаб-с-нт": "штаб-сержант",
    "майстер-с-нт": "майстер-сержант",
    "мол. л-нт": "молодший лейтенант",
    "л-нт": "лейтенант",
    "ст. л-нт": "старший лейтенант",
    капітан: "капітан",
    майор: "майор",
    підполковник: "підполковник",
    полковник: "полковник",
    гс: "головний сержант",
  };
}

window.handlePDFUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file); // Ключ "file" має точно збігатися з аргументом у FastAPI: def parse_pdf(file: UploadFile = File(...))

  UI.showToast("Обробка PDF через Python-сервер...");

  try {
    const response = await fetch(
      "https://pdf-parser-dcq3.onrender.com/parse-pdf",
      {
        method: "POST",
        body: formData, // НЕ вказуйте заголовки вручну! Браузер сам додасть boundary.
      },
    );

    if (!response.ok) {
      throw new Error(`Помилка сервера: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    if (data.date) {
      state.currentDate = data.date;
      const dateInput = document.getElementById("reportDate");
      if (dateInput) dateInput.value = data.date;
    }

    let currentList = [...state.getPersonnelForCurrentDate()];

    data.personnel.forEach((newPerson) => {
      const idx = currentList.findIndex(
        (p) => (p.name || "").toLowerCase() === newPerson.name.toLowerCase(),
      );
      if (idx !== -1) {
        currentList[idx] = newPerson;
      } else {
        currentList.push(newPerson);
      }
    });

    currentList.sort((a, b) => {
      const nameA = (a.name || "").toLowerCase();
      const nameB = (b.name || "").toLowerCase();
      return nameA.localeCompare(nameB, "uk");
    });

    state.setPersonnelForCurrentDate(currentList);
    await MealService.syncToFirestore(state.currentDate);
    App.updateUnitFilterOptions();
    App.renderTable();

    if (data.duplicates && data.duplicates.length > 0) {
      UI.showToast(
        `Увага: виявлено дублікати (${data.duplicates.length}). Статуси оновлено.`,
      );
    } else {
      UI.showToast(`Успішно опрацьовано! Осіб: ${data.personnel.length}`);
    }
  } catch (err) {
    console.error("Помилка обробки PDF:", err);
    UI.showToast("Не вдалося обробити PDF через сервер.");
  } finally {
    event.target.value = "";
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());
