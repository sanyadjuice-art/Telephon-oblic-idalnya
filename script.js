// ==========================================
// 1. АВТОРИЗАЦІЯ ЗА ПАРОЛЕМ (PIN: 2304)
// ==========================================
function checkPassword() {
    const input = document.getElementById("passInput");
    if (!input) return;
    
    if (input.value === "2304") {
        localStorage.setItem("isAuth", "true");
        document.getElementById("authModal").style.display = "none";
        document.getElementById("appContent").style.display = "block";
    } else {
        alert("Невірний пароль!");
        input.value = "";
    }
}

// Дозволяємо підтверджувати пароль клавішею Enter
document.addEventListener("keypress", function(e) {
    if (e.key === "Enter") {
        const passInput = document.getElementById("passInput");
        if (passInput && document.activeElement === passInput) {
            checkPassword();
        }
    }
});

// ==========================================
// 2. ГЛОБАЛЬНІ ЗМІННІ ТА СТАН
// ==========================================
let dbByDate = JSON.parse(localStorage.getItem("food_db_by_date")) || {};
let currentDateStr = "";
let searchQuery = "";

// Початкові стандартні записи (на випадок порожньої бази)
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
  {
    rank: "сержант",
    name: "Сидоренко С.С.",
    unit: "Штаб",
    s: "Не зараховувати",
    o: "Не зараховувати",
    v: "Не зараховувати",
  },
];

// ==========================================
// 3. РОБОТА З CLOUD FIRESTORE
// ==========================================
async function syncFromFirestore(dateStr) {
  if (!window.db) return false;
  try {
    const { doc, getDoc } =
      await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
    const docRef = doc(window.db, "meals", dateStr);
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
  if (!window.db) return;
  try {
    const { doc, setDoc } =
      await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
    const docRef = doc(window.db, "meals", dateStr);
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

// ==========================================
// 4. ІНІЦІАЛІЗАЦІЯ ДОДАТКА ПРИ ЗАВАНТАЖЕННІ
// ==========================================
window.addEventListener("DOMContentLoaded", async () => {
  // Перевірка стану авторизації
  if (localStorage.getItem("isAuth") === "true") {
      const modal = document.getElementById("authModal");
      const app = document.getElementById("appContent");
      if (modal) modal.style.display = "none";
      if (app) app.style.display = "block";
  }

  const today = new Date().toISOString().split("T")[0];
  const reportDateInput = document.getElementById("reportDate");
  if (reportDateInput) {
    reportDateInput.value = today;
  }

  // Спроба завантажити дані для поточного дня
  const loadedFromCloud = await syncFromFirestore(today);

  if (!loadedFromCloud) {
    fetch("data.json")
      .then((response) => {
        if (response.ok) return response.json();
        throw new Error("Файл data.json не знайдено");
      })
      .then((data) => {
        if (typeof data === "object" && !Array.isArray(data)) {
          dbByDate = data;
        } else if (Array.isArray(data)) {
          dbByDate[today] = data;
        }
        saveLocal();
        onDateChange();
      })
      .catch(() => {
        onDateChange();
      });
  } else {
    onDateChange();
  }
});

// ==========================================
// 5. ОСНОВНА ЛОГІКА ТА ОБРОБКА ДАТИ
// ==========================================
function getCurrentDate() {
  const el = document.getElementById("reportDate");
  return el ? el.value : new Date().toISOString().split("T")[0];
}

async function onDateChange() {
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
}

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

// ==========================================
// 6. ОНОВЛЕННЯ СПИСКІВ ТА ФІЛЬТРІВ (DATALISTS)
// ==========================================
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

  if (Array.from(unitsSet).includes(selectedVal)) {
    unitSelect.value = selectedVal;
  } else {
    unitSelect.value = "ALL";
  }
}

function updateDatalists() {
  const ranksSet = new Set();
  const unitsSet = new Set();
  const list = getPersonnel();

  list.forEach((p) => {
    if (p.rank) ranksSet.add(p.rank);
    if (p.unit && p.unit !== "-") unitsSet.add(p.unit);
  });

  const defaultRanks = [
    "солдат",
    "старший солдат",
    "молодший сержант",
    "сержант",
    "старший сержант",
    "головний сержант",
    "штаб-сержант",
    "майстер-сержант",
    "молодший лейтенант",
    "лейтенант",
    "старший лейтенант",
    "капітан",
    "майор",
    "підполковник",
    "полковник",
  ];
  defaultRanks.forEach((r) => ranksSet.add(r));

  const ranksList = document.getElementById("ranksList");
  if (ranksList) {
    ranksList.innerHTML = "";
    Array.from(ranksSet)
      .sort()
      .forEach((r) => {
        ranksList.innerHTML += `<option value="${r}">`;
      });
  }

  const unitsList = document.getElementById("unitsList");
  if (unitsList) {
    unitsList.innerHTML = "";
    Array.from(unitsSet)
      .sort()
      .forEach((u) => {
        unitsList.innerHTML += `<option value="${u}">`;
      });
  }
}

// ==========================================
// 7. ПОШУК ТА ІНТЕРФЕЙС
// ==========================================
function toggleForm(forceOpen = false) {
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

function promptSearch() {
  let query = prompt("Введіть прізвище або підрозділ для пошуку:");
  if (query !== null) {
    searchQuery = query.toLowerCase().trim();
    const btn = document.getElementById("resetSearchBtn");
    if (btn) btn.style.display = searchQuery ? "inline-block" : "none";
    renderTable();
  }
}

function resetSearch() {
  searchQuery = "";
  const btn = document.getElementById("resetSearchBtn");
  if (btn) btn.style.display = "none";
  renderTable();
}

// ==========================================
// 8. УПРАВЛІННЯ ХАРЧУВАННЯМ (TOGGLE)
// ==========================================
function toggleMeal(index, mealType) {
  const list = getPersonnel();
  if (!list[index]) return;

  const currentStatus = list[index][mealType];
  list[index][mealType] =
    currentStatus === "Зарахувати" ? "Не зараховувати" : "Зарахувати";

  saveLocal();
  syncToFirestore(currentDateStr);
  renderTable();
}

// ==========================================
// 9. ВІДОБРАЖЕННЯ ТАБЛИЦІ (RENDER)
// ==========================================
function renderTable() {
  const tbody = document.getElementById("tableBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const list = getPersonnel();
  sortPersonnel(list);
  updateDatalists();

  const unitFilterEl = document.getElementById("unitFilter");
  const selectedUnit = unitFilterEl ? unitFilterEl.value : "ALL";
  let filteredIndex = 0;

  let countS = 0;
  let countO = 0;
  let countV = 0;

  list.forEach((p, originalIndex) => {
    if (
      searchQuery &&
      !p.name.toLowerCase().includes(searchQuery) &&
      !p.unit.toLowerCase().includes(searchQuery)
    ) {
      return;
    }
    if (selectedUnit !== "ALL" && p.unit !== selectedUnit) {
      return;
    }

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
            <td>
                <button class="btn-meal ${sActive ? "active" : "inactive"}" onclick="toggleMeal(${originalIndex}, 's')">
                    ${sActive ? "Зарахований" : "Незарахований"}
                </button>
            </td>
            <td>
                <button class="btn-meal ${oActive ? "active" : "inactive"}" onclick="toggleMeal(${originalIndex}, 'o')">
                    ${oActive ? "Зарахований" : "Незарахований"}
                </button>
            </td>
            <td>
                <button class="btn-meal ${vActive ? "active" : "inactive"}" onclick="toggleMeal(${originalIndex}, 'v')">
                    ${vActive ? "Зарахований" : "Незарахований"}
                </button>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn-warning" onclick="editPerson(${originalIndex})" title="Редагувати">✎</button>
                    <button class="btn-danger" onclick="removePerson(${originalIndex})" title="Видалити">X</button>
                </div>
            </td>
        </tr>`;
    tbody.innerHTML += row;
  });

  const totalS = document.getElementById("totalBreakfast");
  const totalO = document.getElementById("totalLunch");
  const totalV = document.getElementById("totalDinner");

  if (totalS) totalS.innerText = countS;
  if (totalO) totalO.innerText = countO;
  if (totalV) totalV.innerText = countV;
}

// ==========================================
// 10. ДОДАВАННЯ ТА РЕДАГУВАННЯ ОСОБОВОГО СКЛАДУ
// ==========================================
function savePerson() {
  const rank = document.getElementById("newRank").value.trim();
  const name = document.getElementById("newName").value.trim();
  const unit = document.getElementById("newUnit").value.trim();
  const editIndex = parseInt(document.getElementById("editIndex").value);

  if (!name) {
    alert("Будь ласка, введіть прізвище!");
    return;
  }

  const list = getPersonnel();

  if (editIndex === -1) {
    list.push({
      rank: rank || "солдат",
      name: name,
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
  searchQuery = "";
  const btn = document.getElementById("resetSearchBtn");
  if (btn) btn.style.display = "none";
  renderTable();
}

function editPerson(index) {
  const list = getPersonnel();
  const p = list[index];
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
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetForm() {
  document.getElementById("newRank").value = "";
  document.getElementById("newName").value = "";
  document.getElementById("newUnit").value = "";
  document.getElementById("editIndex").value = "-1";

  document.getElementById("formTitle").innerText =
    "➕ Додати нового військовослужбовця";
  document.getElementById("saveBtn").innerText = "Додати до списку";
  document.getElementById("cancelBtn").style.display = "none";

  toggleForm(false);
}

function removePerson(index) {
  if (confirm("Видалити цього військовослужбовця зі списку?")) {
    const list = getPersonnel();
    list.splice(index, 1);
    saveLocal();
    syncToFirestore(currentDateStr);
    resetForm();
    updateUnitFilterOptions();
    renderTable();
  }
}

// ==========================================
// 11. ФАЙЛОВІ ОПЕРАЦІЇ (JSON)
// ==========================================
async function saveDataToJson() {
  try {
    const dataToSave = dbByDate;

    if (!dataToSave || Object.keys(dataToSave).length === 0) {
      alert("Немає даних для збереження!");
      return;
    }

    const jsonString = JSON.stringify(dataToSave, null, 2);
    const todayStr = new Date().toISOString().split("T")[0];
    const fileName = `meal_data_${todayStr}.json`;

    if ("showSaveFilePicker" in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: "Файл даних JSON (*.json)",
              accept: { "application/json": [".json"] },
            },
          ],
        });

        const writable = await handle.createWritable();
        await writable.write(jsonString);
        await writable.close();

        alert("Дані успішно збережено у файл!");
      } catch (err) {
        if (err.name === "AbortError") {
          console.log("Збереження скасовано.");
        } else {
          console.error("Помилка File System API:", err);
          fallbackDownload(jsonString, fileName);
        }
      }
    } else {
      fallbackDownload(jsonString, fileName);
    }
  } catch (error) {
    console.error("Критична помилка під час підготовки даних:", error);
    alert("Виникла помилка під час формування файлу даних.");
  }
}

function fallbackDownload(content, filename) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.style.display = "none";

  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);

  alert("Файл збережено!");
}

function loadFromFile() {
  const fileInput = document.getElementById("fileInput");
  if (fileInput) fileInput.click();
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const loadedData = JSON.parse(e.target.result);
      if (typeof loadedData === "object" && !Array.isArray(loadedData)) {
        dbByDate = loadedData;
        saveLocal();
        await syncToFirestore(currentDateStr);
        onDateChange();
        alert("Дані успішно завантажено!");
      } else if (Array.isArray(loadedData)) {
        dbByDate[currentDateStr] = loadedData;
        saveLocal();
        await syncToFirestore(currentDateStr);
        renderTable();
        alert(`Дані завантажено на дату ${currentDateStr}!`);
      } else {
        alert("Помилка: Некоректна структура JSON!");
      }
    } catch (err) {
      alert("Помилка читання JSON файлу!");
    }
  };
  reader.readAsText(file);
}

// ==========================================
// 12. ЕКСПОРТ У EXCEL
// ==========================================
function exportToExcel() {
  const dateVal = getCurrentDate();
  const list = getPersonnel();
  sortPersonnel(list);

  const unitFilterEl = document.getElementById("unitFilter");
  const selectedUnit = unitFilterEl ? unitFilterEl.value : "ALL";
  const unitTitle =
    selectedUnit === "ALL" ? "Всі підрозділи" : `Підрозділ: ${selectedUnit}`;

  let excelData = [
    [`ЗВІТ ПРО ФАКТИЧНЕ ХАРЧУВАННЯ ОСОБОВОГО СКЛАДУ ЗА ДАТУ: ${dateVal}`],
    [`Фільтр: ${unitTitle}`],
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

  let countS = 0;
  let countO = 0;
  let countV = 0;
  let rowIdx = 0;

  list.forEach((p) => {
    if (selectedUnit !== "ALL" && p.unit !== selectedUnit) return;

    rowIdx++;
    let sVal = p.s || "Не зараховувати";
    let oVal = p.o || "Не зараховувати";
    let vVal = p.v || "Не зараховувати";

    if (sVal === "Зарахувати") countS++;
    if (oVal === "Зарахувати") countO++;
    if (vVal === "Зарахувати") countV++;

    excelData.push([rowIdx, p.rank, p.name, p.unit, sVal, oVal, vVal]);
  });

  excelData.push([]);
  excelData.push([
    "ПІДСУМОК:",
    "",
    "",
    "",
    `Всього на сніданок: ${countS}`,
    `На обід: ${countO}`,
    `На вечерю: ${countV}`,
  ]);

  if (typeof XLSX !== "undefined") {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(excelData);
    XLSX.utils.book_append_sheet(wb, ws, "Звіт харчування");
    XLSX.writeFile(wb, `Zvit_Harchuvannya_${dateVal}.xlsx`);
  } else {
    alert("Бібліотека SheetJS (XLSX) не підключена в HTML!");
  }
}