# Fan Guys Books

Invoice Pro and Ledger Pro in one app, in the Airflow look: the fan at the top spins at this month's pace. Both sides share one storage on your phone, so a finished invoice report goes into the Ledger with one tap. No copying, no pasting.

**Open it:** https://thefanguys.github.io/Fan-Guys-Books/

## How it works

- **Invoices tab:** reports and receipts, same as Invoice Pro.
- **Ledger tab:** jobs by year, same as Ledger Pro.
- **Send to Ledger:** on any report, tap the ⋮ menu → Send to Ledger. Reports already in the Ledger show "In Ledger — View" instead.
- **Send All Unsent:** More → Send All Unsent to Ledger. Skips anything already there.
- **One passcode** for both sides. Default is 7264; change it under More → Passcode.
- **One backup file:** the Backup button saves invoices, receipts, photos and the ledger together.
- **Restore** takes any Fan Guys backup: a Fan Guys Books file, an old Invoice Pro file, or an old Ledger Pro file. It only adds what's missing; nothing is deleted.

## Emailing an invoice

On a report, tap ⋮ → **Email Invoice**. The app makes the PDF, saves it into the job's Google Drive folder, and opens your mail app (Spark, if it's your default) with the Bill-to people, the subject and the folder link filled in. The invoice total is never put in the email.

- **Email several:** on the Invoices list, tap **Email several**, pick the reports, and send them all in one email with a link to each job folder.

- **Bill to:** More → Bill to. Vivid Air (GFY) is the default; add another company if you need it. Emails are saved on your phone only.
- **Job folders:** Drive → the company's folder (Go Fan Yourself for Vivid Air) → year folder (like 2026) → one folder per report. Make next year's folder (like 2027) yourself when the year starts. The app makes the job folder when you start a report, or uses one you made with the exact same name. ⋮ → **Open Job Folder** to add jobsite photos.
- **Google Drive setup (one time):** More → Connect Google Drive and follow the five steps. A small script in your own Google account does the saving; the app never signs in to Google and nobody else gets access.

## Moving in from the old apps

1. Add Fan Guys Books to your home screen from Safari (Share → Add to Home Screen).
2. Open it and go to **More → Restore from Backup**. Pick your old Invoice Pro backup file.
3. Do it again and pick your old Ledger Pro backup file.
4. Tap **Backup** to save one combined file.

## Privacy

No business data is stored in this repo or in the code. Everything lives on your phone, plus whatever backup files you save.

## Files

- `index.html` opens whichever side you used last
- `invoices.html` is the Invoices side
- `ledger.html` is the Ledger side
- `books.js` holds the shared parts: passcode, send to Ledger, backup and restore, the fan
- `drive.js` handles Google Drive, Bill-to contacts and emailing invoices
- `airflow.css` and `fonts/` are the look

No build step. Hosted on GitHub Pages.
