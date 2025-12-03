# PlanPin

## 📌 Overview

PlanPin is an iOS app designed for professionals carrying out site inspection work (such as in the construction industry). It allows the user to annotate site plans, track inspection data, and automatically generate reports.

App Store link: [https://apps.apple.com/us/app/planpin/id6749440381](https://apps.apple.com/us/app/planpin/id6749440381).

## 👷🏼‍♂️ How professionals use PlanPin

1. Upload a PDF of the site plan.
2. Use the custom PDF viewer to navigate the site plan and tap anywhere to pin an item (e.g. a construction defect that’s been spotted).
3. Add descriptions, categories and photos (snap them in-app or upload existing) to document the item.
4. Automatically generate an editable .docx inspection report. The report shows all documented items along with their locations, descriptions and photos, and highlights those with high priority.

Offline? Steps 1-3 work locally and only sync to cloud when possible. So you can collect all the data you need, and generate a report when you’re back online!

## 🔨 How it’s built

- 📱 Front end: **React** with **Capacitor**.
- 🌐 Back end: **Python** with **FastAPI**, hosted on **Railway**.
- ☁️ Cloud database: **Supabase** (**PostgreSQL**).
- 💽 Local database: **SQLite**.
- ✉️ Automated email sending: **Mailjet**.
- 👤 User authentication: **Supabase Auth**.