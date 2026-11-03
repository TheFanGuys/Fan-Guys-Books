# Fan Guys Books

Invoice Pro and Ledger Pro in one app. Both sides share one storage on your phone, so a finished invoice report goes into the Ledger with one tap. No copying, no pasting.

**Open it:** https://thefanguys.github.io/Fan-Guys-Books/

## How it works

- **Invoices tab:** reports and receipts, same as Invoice Pro.
- **Ledger tab:** jobs by year, same as Ledger Pro.
- **Send to Ledger:** on any report, tap the ⋮ menu → Send to Ledger. Reports already in the Ledger show "In Ledger — View" instead.
- **Send All Unsent:** More → Send All Unsent to Ledger. Skips anything already there.
- **One passcode** for both sides. Default is 7264; change it under More → Passcode.
- **One backup file:** the Backup button saves invoices, receipts, photos and the ledger together.
- **Restore** takes any Fan Guys backup: a Fan Guys Books file, an old Invoice Pro file, or an old Ledger Pro file. It only adds what's missing; nothing is deleted.

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
- `books.js` holds the shared parts: passcode, send to Ledger, backup and restore

No build step. Hosted on GitHub Pages.
