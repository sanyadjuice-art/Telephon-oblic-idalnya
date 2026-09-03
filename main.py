import io
import re
import pdfplumber
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Python PDF Parser is running"}

@app.post("/parse-pdf")
async def parse_pdf(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        records = []
        extracted_date = ""

        with pdfplumber.open(io.BytesIO(contents)) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                
                # Пошук дати
                date_match = re.search(r'«?(\d{1,2})»?\s+([а-яА-Яа-щШЩЬЮЯєЇїІіґҐ]+)\s+(\d{4})', text)
                if date_match:
                    months = {
                        "січня":"01","лютого":"02","березня":"03","квітня":"04","травня":"05","червня":"06",
                        "липня":"07","серпня":"08","вересня":"09","жовтня":"10","листопада":"11","грудня":"12"
                    }
                    day = date_match.group(1).zfill(2)
                    month = months.get(date_match.group(2).lower(), "01")
                    year = date_match.group(3)
                    extracted_date = f"{year}-{month}-{day}"

                # Витягування таблиць через pdfplumber
                tables = page.extract_tables()
                for table in tables:
                    for row in table:
                        if not row or len(row) < 5:
                            continue
                        
                        row_num = str(row[0]).strip() if row[0] else ""
                        if not row_num.isdigit():
                            continue

                        fio = str(row[1]).replace('\n', ' ').strip() if row[1] else ""
                        if not fio or "осіб, а саме" in fio.lower() or "прізвище" in fio.lower():
                            continue
                        
                        s_status = "Зарахувати" if "зарахувати" in str(row[2]).lower() and "не" not in str(row[2]).lower() else "Не зараховувати"
                        o_status = "Зарахувати" if "зарахувати" in str(row[3]).lower() and "не" not in str(row[3]).lower() else "Не зараховувати"
                        v_status = "Зарахувати" if "зарахувати" in str(row[4]).lower() and "не" not in str(row[4]).lower() else "Не зараховувати"

                        records.append({
                            "rank": "",
                            "name": fio,
                            "unit": "дивізіон",
                            "s": s_status,
                            "o": o_status,
                            "v": v_status
                        })

        # Обробка дублікатів та сортування на стороні Python
        unique_records_map = {}
        duplicates = []

        for item in records:
            name_key = item["name"].lower()
            if name_key in unique_records_map:
                duplicates.append(item["name"])
            unique_records_map[name_key] = item  # Перезапис оновлює статус, але виключає дубль

        final_records = list(unique_records_map.values())
        
        # Сортування в алфавітному порядку за ПІБ
        final_records.sort(key=lambda x: x["name"].lower())

        return JSONResponse(content={
            "date": extracted_date,
            "personnel": final_records,
            "duplicates": list(set(duplicates))
        })
        
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)