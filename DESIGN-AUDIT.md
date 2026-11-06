# Fan Guys Books — design and technical audit

Reviewed November 6, 2026. Source: supplied Fan-Guys-Books-source.zip (archive commit marker 916cdf0b0b400cb9ef99a9b4b2cb3a272a694e79). Live entry: https://thefanguys.github.io/Fan-Guys-Books/. Implementation targets this source snapshot; GitHub history, open issues, and later upstream changes were not inspected.

## 1. Executive summary

The product has valuable, practical workflows: receipt capture, report-to-ledger transfer, yearly summaries, backup/restore, and Drive-assisted invoicing. Its interface is less mature than those workflows. Reports and Ledger feel like separate products, their desktop layouts disagree, and the styling relies on a large compatibility layer overriding older dark interfaces.

The redesign introduces a restrained financial workspace: white surfaces, cool neutral background, blue actions, clear financial typography, compact desktop navigation, and mobile controls that remain reachable. It retains the existing vanilla JavaScript architecture. A React rewrite would introduce substantial regression risk without being necessary for this visual improvement.

## 2. Audit findings

Evidence steps:

1. Live entry/passcode: visually calm; keypad has strong target sizes. Interior was not accessed on the live origin.
2. Local Reports, empty: weak. A 480px-wide column wastes desktop space; a repeated logo dominates the empty state; the creation instruction points to a remote plus button.
3. Local Ledger, empty: weak. Different navigation and page width make this feel like a second app; an empty account receives an immediate backup warning.
4. Local Summary: functional but inconsistent. Metrics, expense tiles, dense tables, and legacy uppercase details lack a consistent reading hierarchy.
5. Redesigned report creation → receipt → ledger → summary: passed the sample workflow described under validation.
6. Redesigned 390×844 layout: no horizontal page overflow in Reports; job creation and dismissal remain reachable in Ledger.

The local baseline required extracting scripts from HTML to avoid the preview server's HTML instrumentation interfering with HTML strings embedded in JavaScript. This is a preview-specific issue, not evidence that the live app is broken.

| Area | Finding and consequence | Priority | Result |
|---|---|---|---|
| Layout | Reports is capped at 480px while Ledger has a wider shell. Desktop space does not support the task consistently. | High | Responsive shared workspace and desktop sidebar implemented. |
| Hierarchy | Large animated fan and logo treatments compete with the data. Financial amounts need a more predictable hierarchy. | High | Compact financial overview, larger tabular figures, smaller fan; branding removed from empty states. |
| Typography | Sora is used across labels, controls, and dense financial data. Heavy weights and old uppercase styles produce unnecessary noise. | Medium | System UI stack, restrained weights, clearer type scale, consistent tracking. |
| Color | The Airflow palette is coherent, but the interface maps exact inline RGB strings to new colors. This can miss future variants. | High | New semantic tokens and component rules added; compatibility mapping remains a documented debt. |
| Components | Reports and Ledger use different form, navigation, and action conventions. Pill shapes are overused. | High | Shared surface, border, button, radius, and dialog rules implemented. Legacy forms retained. |
| Empty/search states | “Tap +” leaves users to find the action. A report search with no matches has no dedicated explanation. | High | Direct creation CTAs and an explicit no-results message implemented. |
| Interaction feedback | Report search replaces its focused input on each keystroke; this disrupts typing. | High | Focus and caret are restored after the render, including clearing the query. |
| Motion | Continuous airflow paths are decorative. A fixed 2.7-second splash delays access regardless of actual readiness. | Medium | Airflow paths removed; fan pace retained; shorter 180ms splash; brief sheet transitions; reduced-motion override. |
| Icons/graphics | Repeated detailed logo imagery and emoji controls add noise and inconsistent rendering. | Medium | Existing line icons retained; report edit uses a text action; repeated embedded logo consolidated into one cached PNG. Some Ledger emoji remain. |
| Mobile | Reports already has useful bottom navigation, while Ledger primarily uses top tabs. Small actions and long forms need attention. | High | Larger frequent actions, Ledger bottom navigation, bounded scrollable dialogs. Existing top tabs retained. |
| Keyboard/accessibility | Icon-only buttons lack names; clickable cards lack keyboard behavior; labels and modal focus behavior are inconsistent. | High | Names for key actions, label associations, keyboard card activation, dialog roles, focus containment/restoration, Escape dismissal. |
| Technical structure | Large inline scripts and duplicate base64 images inflate documents and obscure application code. | Medium | External app scripts and bundled PDF vendor file; shared cached image. No package installation required. |
| Trust/security | Passcode and unlock state are browser-local. A known default PIN is a privacy convenience, not server authentication or encryption. Backups can contain Drive configuration. | High | Existing behavior preserved. Treat backups as sensitive; stronger authentication/encryption requires separate scope. |

### What still limits quality

The retained color-translation layer and inline styles are still brittle. Some receipt photo controls, toggles, tables, and legacy menus need a deeper semantic pass. Error and asynchronous status UI is still largely inherited; this release does not invent a cloud-sync status or claim that local storage is a server-backed system. There is no WCAG compliance claim.

## 3. New direction and principles

**Tone:** precise, calm, practical. This is a tool for reviewing a job's money, not a marketing page.

- Put the job, customer, dates, and amount ahead of branding.
- Use white for working surfaces, a cool neutral background for separation, blue for primary actions, green for completed ledger status, and amber for a real warning.
- Use a 4px spacing rhythm with larger gaps between tasks than between related fields.
- Keep dense amounts tabular and aligned. Use 28–40px figures only for overview values, 16–20px for row values, and 12–14px for context.
- Use 8–12px corners for routine controls and cards, with slightly softer dialog corners. Avoid putting every item in a pill.
- Let motion explain entry and feedback. Preserve the distinctive pace fan without decorative airflow paths. Respect reduced-motion preferences.
- Make the next step explicit in empty states. Keep actions named and reachable on a phone.

## 4. Prioritized concrete changes

### Delivered now

1. Consistent responsive workspace and desktop sidebar.
2. Readable report hierarchy, search, financial overview, and job cards.
3. Direct report/job/receipt creation from empty states.
4. Search focus/caret repair and no-results feedback.
5. Consistent form surfaces, modal sizing, and reachable dismissal controls.
6. Larger common touch targets, useful accessible names, and keyboard handling.
7. Shorter startup delay and cacheable scripts/assets.

### Next priority

1. Replace exact inline-color selectors with explicit semantic component classes, one workflow at a time.
2. Give every upload, PDF, and Drive operation a consistent pending/success/failure state with retry and duplicate-action protection.
3. Finish keyboard semantics for photo capture, toggles, autocomplete, receipt rows, and every legacy menu.
4. Introduce a single responsive navigation component and remove the remaining duplicated mobile/top navigation.
5. Add native Safari/VoiceOver testing, automated contrast/accessibility checks, and regression fixtures for restore/Drive/PDF workflows.
6. Design stronger authentication/encryption separately from this UI pass if records require protection beyond device access.

## 5. Code-level improvements

- `studio.css`: tokens, responsive shell, report cards, figures, forms, states, focus rings, hover feedback, reduced motion, and print exclusions.
- `studio.js`: shared navigation, form label associations, keyboard access, accessible dialog handling, and empty Ledger actions. It performs no data migrations or storage writes.
- `invoices-app.js`: extracted original application; targeted changes to report/receipt actions, search focus, names, headings, and empty states.
- `ledger-app.js`: extracted original application; financial calculations retained, overview wording clarified.
- `jspdf.umd.min.js`: existing bundled jsPDF, extracted without replacing its version or license.
- `assets/brand-2a40d1ca.png`: one reusable copy of the formerly repeated logo.
- `books.js` and `drive.js`: byte-for-byte unchanged from the supplied source.
- `checks/verify.cjs`: dependency-free script parsing, asset-reference checks, fixture exclusion, and backup/ledger-link smoke checks.

The two HTML documents total 43,160 bytes, down from 1,012,873 bytes. This is a reduction in HTML size, not a claim of equivalent overall transfer savings: application and vendor scripts still download as separate cacheable resources. The redesigned package uses system fonts but retains the old fonts because the compatibility stylesheet still references them.

## 6. Validation and delivery

Passed:

- All six application/vendor scripts parse.
- Local HTML asset references resolve.
- The production bundle excludes the isolated preview's automatic unlock script.
- Existing backup recognition, job-number parsing, and invoice-to-ledger linking smoke checks pass.
- Browser: create a sample report, add a $1,250 Labor receipt, transfer to Ledger, verify Summary shows $1,250 invoiced, $1,250 labor, $0 expenses.
- Browser: search produces a clear no-results state and retains focus/caret.
- Browser: mobile Reports measured 390px client width and 390px scroll width.
- Browser: mobile Ledger opens a form with Cancel inside the viewport, then dismisses it successfully.

Limits:

- Cloud Chrome desktop and a 390×844 iframe viewport were used. This does not replace real iPhone Safari, VoiceOver, zoom, or virtual-keyboard testing.
- Google Drive authorization/email delivery, native sharing, PDF output fidelity, camera/OCR, and destructive restore were not exercised.
- The live GitHub Pages site and repository were not modified. The package is a source handoff for that existing site.

### Installation

Back up the current app from its existing origin first. Replace the repository's application files with this folder's files, preserving folder structure, then deploy through its existing GitHub Pages process. There is no build step. Run `node checks/verify.cjs` before deploying.

Browser storage is origin-specific. A local preview or different host does not automatically have your current records. Deploying to the same GitHub Pages origin retains the existing storage-key names, but a verified backup should be kept before any release. No demo jobs or automatic unlock code are included in the source package.
