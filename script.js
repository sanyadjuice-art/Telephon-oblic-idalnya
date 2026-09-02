import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  onAuthStateChanged,
  signOut,
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

// Конфігурація Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAAnZnsJYbTKRPnzZFpc4Z0x2U_eEL7BFc",
  authDomain: "telephon-oblic-idalnya.firebaseapp.com",
  projectId: "telephon-oblic-idalnya",
  storageBucket: "telephon-oblic-idalnya.firebasestorage.app",
  messagingSenderId: "591688369928",
  appId: "1:591688369928:web:89c0ef4ccdd474573s4ebd",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
window.db = db;

// Глобальний стан
let confirmationResultGlobal = null;
let currentUser = null;
let currentUserProfile = null;
let dbByDate = JSON.parse(localStorage.getItem("food_db_by_date")) || {};
let currentDateStr = "";
let searchQuery = "";

const initialPersonnel = [
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

// ==========================================
// 1. АВТОРИЗАЦІЯ PHONE AUTH ТА ПРОФІЛЬ
// ==========================================

window.addEventListener("DOMContentLoaded", () => {
  try {
    window.recaptchaVerifier = new RecaptchaVerifier(
      auth,
      "recaptcha-container",
      {
        size: "invisible",
      },
    );
  } catch (e) {
    console.error("Помилка ініціалізації reCAPTCHA:", e);
  }
});

window.sendSMS = async function () {
  const phoneInput = document.getElementById("phoneNumber");
  const phone = phoneInput ? phoneInput.value.trim() : "";

  if (!phone.startsWith("+380") || phone.length < 13) {
    alert("Введіть коректний номер у форматі +380XXXXXXXXX");
    return;
  }

  try {
    const appVerifier = window.recaptchaVerifier;
    confirmationResultGlobal = await signInWithPhoneNumber(
      auth,
      phone,
      appVerifier,
    );
    document.getElementById("stepPhone").style.display = "none";
    document.getElementById("stepCode").style.display = "block";
  } catch (error) {
    console.error("Помилка відправки SMS:", error);
    alert("Помилка відправки SMS: " + error.message);
  }
};

window.verifyCode = async function () {
  const codeInput = document.getElementById("smsCode");
  const code = codeInput ? codeInput.value.trim() : "";
  if (!code || code.length !== 6) {
    alert("Введіть 6-значний код з SMS!");
    return;
  }

  try {
    const result = await confirmationResultGlobal.confirm(code);
    currentUser = result.user;
    await checkUserProfile(currentUser);
  } catch (error) {
    console.error("Помилка підтвердження коду:", error);
    alert("Невірний код з SMS!");
  }
};

window.resetAuthSteps = function () {
  document.getElementById("stepPhone").style.display = "block";
  document.getElementById("stepCode").style.display = "none";
  document.getElementById("stepProfile").style.display = "none";
};

async function checkUserProfile(user) {
  const userDocRef = doc(db, "users", user.uid);
  const userDoc = await getDoc(userDocRef);

  if (userDoc.exists() && userDoc.data().fullName) {
    currentUserProfile = userDoc.data();
    document.getElementById("authModal").style.display = "none";
    document.getElementById("appContent").style.display = "block";
    document.getElementById("headerUserName").innerText =
      `${currentUserProfile.rank || ""} ${currentUserProfile.fullName}`;

    await setUserOnlineStatus(user.uid, true);
    initAppData();
  } else {
    document.getElementById("stepPhone").style.display = "none";
    document.getElementById("stepCode").style.display = "none";
    document.getElementById("stepProfile").style.display = "block";
  }
}

window.saveProfile = async function () {
  const rank = document.getElementById("userRank").value.trim();
  const fullName = document.getElementById("userFullName").value.trim();
  const unit = document.getElementById("userUnit").value.trim();

  if (!fullName) {
    alert("Будь ласка, вкажіть Прізвище та Ініціали!");
    return;
  }

  if (currentUser) {
    currentUserProfile = {
      phone: currentUser.phoneNumber,
      rank: rank || "солдат",
      fullName: fullName,
      unit: unit || "-",
      role: "client",
      isOnline: true,
      lastSeen: new Date().toISOString(),
    };

    await setDoc(doc(db, "users", currentUser.uid), currentUserProfile, {
      merge: true,
    });

    document.getElementById("authModal").style.display = "none";
    document.getElementById("appContent").style.display = "block";
    document.getElementById("headerUserName").innerText =
      `${currentUserProfile.rank} ${currentUserProfile.fullName}`;

    await setUserOnlineStatus(currentUser.uid, true);
    initAppData();
  }
};

window.logout = async function () {
  if (currentUser) {
    await setUserOnlineStatus(currentUser.uid, false);
  }
  await signOut(auth);
  location.reload();
};

// ==========================================
// 2. ОНЛАЙН-СТАТУС ТА МОНІТОРИНГ
// ==========================================

async function setUserOnlineStatus(uid, isOnline) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
      isOnline: isOnline,
      lastSeen: serverTimestamp(),
    });
  } catch (e) {
    console.error("Помилка оновлення онлайн-статусу:", e);
  }
}

window.addEventListener("beforeunload", () => {
  if (currentUser) {
    setUserOnlineStatus(currentUser.uid, false);
  }
});

function subscribeToOnlineUsers() {
  const usersRef = collection(db, "users");
  onSnapshot(usersRef, (snapshot) => {
    const listEl = document.getElementById("onlineUsersList");
    const countEl = document.getElementById("onlineCount");
    if (!listEl) return;

    listEl.innerHTML = "";
    let onlineCount = 0;

    snapshot.forEach((docSnap) => {
      const userData = docSnap.data();
      const isOnline = userData.isOnline === true;
      if (isOnline) onlineCount++;

      const statusDot = isOnline ? "🟢" : "🔴";
      const userRow = document.createElement("div");
      userRow.className = "online-user-item";
      userRow.innerHTML = `
                <span>${statusDot} <strong>${userData.rank || ""} ${userData.fullName || "Користувач"}</strong> (${userData.unit || "-"})</span>
                <span style="font-size: 11px; color: #64748b;">${userData.phone || ""}</span>
            `;
      listEl.appendChild(userRow);
    });

    if (countEl) countEl.innerText = onlineCount;
  });
}

window.toggleOnlinePanel = function () {
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

// Слухач стану авторизації Firebase
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await checkUserProfile(user);
    subscribeToOnlineUsers();
  } else {
    document.getElementById("authModal").style.display = "flex";
    document.getElementById("appContent").style.display = "none";
  }
});

// ==========================================
// 3. РОБОТА З БАЗОЮ ТАБЛИЦІ (FIRESTORE & LOCAL)
// ==========================================

async function initAppData() {
  const today = new Date().toISOString().split("T")[0];
  const reportDateInput = document.getElementById("reportDate");
  if (reportDateInput) reportDateInput.value = today;

  const loadedFromCloud = await syncFromFirestore(today);
  if (!loadedFromCloud) {
    fetch("data.json")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (typeof data === "object" && !Array.isArray(data)) dbByDate = data;
        else if (Array.isArray(data)) dbByDate[today] = data;
        saveLocal();
        onDateChange();
      })
      .catch(() => onDateChange());
  } else {
    onDateChange();
  }
}

async function syncFromFirestore(dateStr) {
  try {
    const docRef = doc(db, "meals", dateStr);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      dbByDate[dateStr] = docSnap.data().personnel || [];
      saveLocal();
      return true;
    }
  } catch (err) {
    console.error("Помилка завантаження з Firestore:", err);
  }
  return false;
}

async function syncToFirestore(dateStr) {
  try {
    const docRef = doc(db, "meals", dateStr);
    await setDoc(
      docRef,
      {
        personnel: dbByDate[dateStr] || [],
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  } catch (err) {
    console.error("Помилка збереження в Firestore:", err);
  }
}

function getCurrentDate() {
  const el = document.getElementById("reportDate");
  return el ? el.value : new Date().toISOString().split("T")[0];
}

window.onDateChange = async function () {
  currentDateStr = getCurrentDate();
  if (!currentDateStr) return;

  await syncFromFirestore(currentDateStr);

  if (!dbByDate[currentDateStr]) {
    const dates = Object.keys(dbByDate).sort();
    if (dates.length > 0) {
      const lastDate = dates[dates.length - 1];
      dbByDate[currentDateStr] = dbByDate[lastDate].map((p) => ({
        ...p,
        s: "Не зараховувати",
        o: "Не зараховувати",
        v: "Не зараховувати",
      }));
    } else {
      dbByDate[currentDateStr] = JSON.parse(JSON.stringify(initialPersonnel));
    }
    saveLocal();
    syncToFirestore(currentDateStr);
  }

  updateUnitFilterOptions();
  renderTable();
};

function getPersonnel() {
  return dbByDate[currentDateStr] || [];
}
function saveLocal() {
  localStorage.setItem("food_db_by_date", JSON.stringify(dbByDate));
}

function sortPersonnel(arr) {
  arr.sort((a, b) => {
    const unitCompare = (a.unit || "").localeCompare(b.unit || "", "uk");
    if (unitCompare !== 0) return unitCompare;
    return (a.name || "").localeCompare(b.name || "", "uk");
  });
}

function updateUnitFilterOptions() {
  const unitSelect = document.getElementById("unitFilter");
  if (!unitSelect) return;
  const selectedVal = unitSelect.value;
  const list = getPersonnel();
  const unitsSet = new Set();

  list.forEach((p) => {
    if (p.unit && p.unit !== "-") unitsSet.add(p.unit);
  });

  unitSelect.innerHTML = `<option value="ALL">Всі підрозділи</option>`;
  Array.from(unitsSet)
    .sort()
    .forEach((u) => {
      unitSelect.innerHTML += `<option value="${u}">${u}</option>`;
    });

  if (Array.from(unitsSet).includes(selectedVal))
    unitSelect.value = selectedVal;
  else unitSelect.value = "ALL";
}

function updateDatalists() {
  const ranksSet = new Set();
  const unitsSet = new Set();
  getPersonnel().forEach((p) => {
    if (p.rank) ranksSet.add(p.rank);
    if (p.unit && p.unit !== "-") unitsSet.add(p.unit);
  });

  const defaultRanks = [
    "солдат",
    "старший солдат",
    "сержант",
    "лейтенант",
    "капітан",
    "майор",
    "підполковник",
  ];
  defaultRanks.forEach((r) => ranksSet.add(r));

  const fillList = (id, set) => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = "";
      Array.from(set)
        .sort()
        .forEach((item) => (el.innerHTML += `<option value="${item}">`));
    }
  };

  fillList("ranksList", ranksSet);
  fillList("unitsList", unitsSet);
  fillList("authRanksList", ranksSet);
  fillList("authUnitsList", unitsSet);
}

// ==========================================
// 4. ІНТЕРФЕЙС ТА ТАБЛИЦЯ
// ==========================================

window.toggleForm = function (forceOpen = false) {
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
};

window.promptSearch = function () {
  let query = prompt("Введіть прізвище або підрозділ для пошуку:");
  if (query !== null) {
    searchQuery = query.toLowerCase().trim();
    const btn = document.getElementById("resetSearchBtn");
    if (btn) btn.style.display = searchQuery ? "inline-block" : "none";
    renderTable();
  }
};

window.resetSearch = function () {
  searchQuery = "";
  const btn = document.getElementById("resetSearchBtn");
  if (btn) btn.style.display = "none";
  renderTable();
};

window.toggleMeal = function (index, mealType) {
  const list = getPersonnel();
  if (!list[index]) return;
  list[index][mealType] =
    list[index][mealType] === "Зарахувати" ? "Не зараховувати" : "Зарахувати";
  saveLocal();
  syncToFirestore(currentDateStr);
  renderTable();
};

window.renderTable = function () {
  const tbody = document.getElementById("tableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const list = getPersonnel();
  sortPersonnel(list);
  updateDatalists();

  const selectedUnit = document.getElementById("unitFilter")
    ? document.getElementById("unitFilter").value
    : "ALL";
  let filteredIndex = 0;
  let countS = 0,
    countO = 0,
    countV = 0;

  list.forEach((p, originalIndex) => {
    if (
      searchQuery &&
      !p.name.toLowerCase().includes(searchQuery) &&
      !p.unit.toLowerCase().includes(searchQuery)
    )
      return;
    if (selectedUnit !== "ALL" && p.unit !== selectedUnit) return;

    filteredIndex++;
    const sActive = p.s === "Зарахувати";
    const oActive = p.o === "Зарахувати";
    const vActive = p.v === "Зарахувати";

    if (sActive) countS++;
    if (oActive) countO++;
    if (vActive) countV++;

    let row = `<tr>
            <td>${filteredIndex}</td>
            <td>${p.rank}</td>
            <td style="text-align: left; font-weight: 600;">${p.name}</td>
            <td>${p.unit}</td>
            <td><button class="btn-meal ${sActive ? "active" : "inactive"}" onclick="toggleMeal(${originalIndex}, 's')">${sActive ? "Зарахований" : "Незарахований"}</button></td>
            <td><button class="btn-meal ${oActive ? "active" : "inactive"}" onclick="toggleMeal(${originalIndex}, 'o')">${oActive ? "Зарахований" : "Незарахований"}</button></td>
            <td><button class="btn-meal ${vActive ? "active" : "inactive"}" onclick="toggleMeal(${originalIndex}, 'v')">${vActive ? "Зарахований" : "Незарахований"}</button></td>
            <td>
                <div class="action-buttons">
                    <button class="btn-warning" onclick="editPerson(${originalIndex})" title="Редагувати">✎</button>
                    <button class="btn-danger" onclick="removePerson(${originalIndex})" title="Видалити">X</button>
                </div>
            </td>
        </tr>`;
    tbody.innerHTML += row;
  });

  if (document.getElementById("totalBreakfast"))
    document.getElementById("totalBreakfast").innerText = countS;
  if (document.getElementById("totalLunch"))
    document.getElementById("totalLunch").innerText = countO;
  if (document.getElementById("totalDinner"))
    document.getElementById("totalDinner").innerText = countV;
};

window.savePerson = function () {
  const rank = document.getElementById("newRank").value.trim();
  const name = document.getElementById("newName").value.trim();
  const unit = document.getElementById("newUnit").value.trim();
  const editIndex = parseInt(document.getElementById("editIndex").value);

  if (!name) {
    alert("Введіть прізвище!");
    return;
  }
  const list = getPersonnel();

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
    list[editIndex].rank = rank || "солдат";
    list[editIndex].name = name;
    list[editIndex].unit = unit || "-";
  }

  saveLocal();
  syncToFirestore(currentDateStr);
  resetForm();
  updateUnitFilterOptions();
  renderTable();
};

window.editPerson = function (index) {
  const p = getPersonnel()[index];
  if (!p) return;
  document.getElementById("newRank").value = p.rank;
  document.getElementById("newName").value = p.name;
  document.getElementById("newUnit").value = p.unit;
  document.getElementById("editIndex").value = index;

  document.getElementById("formTitle").innerText =
    "✏️ Редагувати військовослужбовця";
  document.getElementById("saveBtn").innerText = "Зберегти зміни";
  document.getElementById("cancelBtn").style.display = "inline-block";
  toggleForm(true);
};

window.resetForm = function () {
  document.getElementById("newRank").value = "";
  document.getElementById("newName").value = "";
  document.getElementById("newUnit").value = "";
  document.getElementById("editIndex").value = "-1";
  document.getElementById("formTitle").innerText =
    "➕ Додати нового військовослужбовця";
  document.getElementById("saveBtn").innerText = "Додати до списку";
  document.getElementById("cancelBtn").style.display = "none";
  toggleForm(false);
};

window.removePerson = function (index) {
  if (confirm("Видалити військовослужбовця?")) {
    getPersonnel().splice(index, 1);
    saveLocal();
    syncToFirestore(currentDateStr);
    renderTable();
  }
};

window.saveDataToJson = async function () {
  const jsonString = JSON.stringify(dbByDate, null, 2);
  const fileName = `meal_data_${new Date().toISOString().split("T")[0]}.json`;
  const blob = new Blob([jsonString], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
};

window.loadFromFile = function () {
  const input = document.getElementById("fileInput");
  if (input) input.click();
};

window.handleFileSelect = function (event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const loaded = JSON.parse(e.target.result);
      if (typeof loaded === "object" && !Array.isArray(loaded))
        dbByDate = loaded;
      saveLocal();
      await syncToFirestore(currentDateStr);
      onDateChange();
      alert("Дані успішно завантажено!");
    } catch (err) {
      alert("Помилка читання JSON!");
    }
  };
  reader.readAsText(file);
};

window.exportToExcel = function () {
  const list = getPersonnel();
  sortPersonnel(list);
  let excelData = [
    [`ЗВІТ ПРО ФАКТИЧНЕ ХАРЧУВАННЯ ЗА ДАТУ: ${getCurrentDate()}`],
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

  if (typeof XLSX !== "undefined") {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(excelData);
    XLSX.utils.book_append_sheet(wb, ws, "Звіт");
    XLSX.writeFile(wb, `Zvit_${getCurrentDate()}.xlsx`);
  } else {
    alert("Бібліотека XLSX не підключена!");
  }
};
