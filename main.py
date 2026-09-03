import os
import re
import io
import pdfplumber
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Дозволяємо запити з будь-яких джерел (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "PDF Parser API is running"}

@app.post("/parse-pdf")
async def parse_pdf(file: UploadFile = File(...)):
    contents = await file.read()
    records = []
    extracted_date = ""

    with pdfplumber.open(io.BytesIO(contents)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            
            # Пошук дати заявки
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

            # Обробка таблиці
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    if not row or len(row) < 5:
                        continue
                    
                    row_num = str(row[0]).strip() if row[0] else ""
                    if not row_num.isdigit():
                        continue

                    fio = str(row[1]).replace('\n', ' ').strip() if row[1] else ""
                    
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

    return {
        "date": extracted_date,
        "personnel": records
    }