# Church office 1.1 — everyday guide

## Members and profiles

Click a member’s name, photograph, or row to open their full profile. Photographs can be enlarged. **Edit member details** now includes email, home area/address, date of birth, and baptism date alongside the original registration fields. Empty fields remain visibly unrecorded; no personal information is inferred.

**View attendance history** shows their latest 50 recorded gatherings. **Print / PDF** opens the browser print dialog with the profile formatted for paper; choose Save as PDF where supported. Birth dates feed the administrator’s upcoming-birthday list. February 29 birthdays are shown on February 28 in non-leap years.

## Attendance

Administrators and registrars can open **Attendance**, add a service, and check in members. Search narrows the list without clearing existing selections. Count visitors separately so they are not accidentally recorded as named members. Save to update everyone’s shared records.

Attendance can be exported as CSV. If another staff member saves while you are working, the system refuses to overwrite their changes; close and reopen the service to review the latest attendance. Only administrators can delete services. Deleting a member removes their linked attendance entries; use Inactive membership status when you want to preserve their history.

## Member care

The **Member care** board is visible only to administrators. Create a general task or link it to a member, assign an active administrator, set a due date and priority, and record notes. Open a card to move it from To do to In progress or Completed. Overdue tasks are highlighted.

Care notes are not public and are not visible to registrars. Completion is a tracking action; it does not send an email, SMS, or notification. Deleting a member unlinks care tasks without deleting those tasks or their notes. Remove any retained personal notes separately when required by the church’s retention policy.

## Reports

**Reports** provides:

- Attendance and confirmed production M-Pesa totals for the selected dates.
- Current membership and ministry breakdowns.
- Members whose birthdays fall in the next 30 days.
- An attendance CSV report.

Attendance totals count visits, not unique people: one person at three services contributes three visits. Member/ministry breakdowns describe the current directory; birthdays always use the next 30 days, independent of the report’s date range. New-member figures count records added in the period, including imports. M-Pesa sandbox transactions are excluded from confirmed giving. Giving report boundaries use Kenya time.

## Backups and activity

Administrators can select **Backups & activity → Create backup** and download a consistent SQLite snapshot. The backup includes members, photographs, attendance, tasks, accounts, messages, content, and payment records. Downloaded files are sensitive; keep protected off-server copies. Restore remains a server-operator task as described in DEPLOYMENT.md.

The activity log is paginated and identifies staff actions. Its entries do not contain member-care notes or passwords. Creating/downloading a backup is also logged.

## Website calendars

Published events with a date now have **Add to my calendar**. The download is an `.ics` file for compatible calendar applications. Timed events use Kenya time; date-only events are all-day. No duration is invented when an end time was not supplied. Draft events cannot be downloaded publicly.

## Desktop installation

### Windows 10 / 11

Run **ChurchRegister/release/VWO-Church-Office-Setup.exe**, or choose **Install desktop app** in the church office to download it.

1. Enter the church server address. On this development PC, use `http://localhost:3000`. On other PCs, use the church’s hosted HTTPS origin.
2. Choose Install. The setup installs for your Windows account, without administrator elevation, under `%LOCALAPPDATA%\VWOChurchOffice`.
3. Open **VWO Church Office** from the desktop or Start menu and sign in.
4. Change the server address later using **Start → VWO Church Office → Connection settings**.
5. Remove it through **Windows Settings → Apps → VWO Church Office → Uninstall**. Online records remain on the church server.

Microsoft Edge and the Windows .NET Framework are required; standard supported Windows installations normally include them. The package is unsigned. Before widespread distribution, have the release signed with the operator’s code-signing certificate. Do not disable Windows security protections to install it.

The installer can be rerun to update or reconfigure the same installation. The web interface is loaded from the server each time the app opens, so future website/office improvements do not require repackaging the launcher. Reopen an already-running office to load an updated interface.

### macOS, Linux, and other compatible browsers

Open the hosted `/desktop` page in a browser that supports web-app installation (for example Chrome or Edge). Choose **Install desktop app → Install browser app** when offered, or use the browser’s Install option. This provides a standalone application window and operating-system launcher using the same online office.

This release includes a native Windows setup executable and a browser-installable app. It does not include native macOS `.dmg` or Linux `.deb` packages. Browser installation capability depends on the installed browser and cannot be used in a private/incognito window. No service worker or offline member cache is introduced; internet access is still required.

## Verification

Automated checks cover attendance/version conflicts, member milestone validation, care permissions, reports, restoring a downloaded backup, calendar escaping and timezone handling, existing security/payment behaviour, and desktop/mobile browser workflows. Windows installer self-tests exercise payload extraction, configuration, shortcut creation, updates, and removal of owned files in an isolated test directory. They do not modify the real user’s Start menu or uninstall registry entries. Browser installability is verified in a normal persistent Edge profile. macOS/Linux OS-level installation has not been exercised on this Windows workstation.

References: [installable web apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [iCalendar specification](https://www.rfc-editor.org/rfc/rfc5545).

## Office sessions and gallery uploads

Closing the admin tab or desktop office window ends that window's sign-in. Reopening, refreshing, or returning from browser history requires signing in again. Switching tabs or minimizing the window keeps the current session. The office keeps its session verification key only in page memory and sends a close request to revoke the server session. Abrupt browser termination or lost connectivity can prevent that request; reopening still cannot restore access, and abandoned server sessions expire after 30 minutes.

To upload a gallery photograph, open **Website content ? Add content**, choose **gallery**, enter a title, and select **Upload an image from your computer**. Preview the photo, select **Publish on the website** when ready, then save. JPEG, PNG, and WebP images up to 5 MB are supported. Existing entries can have their image replaced or removed. Uploaded images are stored in the shared database and included in database backups. Draft uploads require administrator access; published photos are available on the public website. These controls also work in the desktop office.

## Mission and church leadership

The home and Our church pages display the mission and published church leaders. Edit the mission under Church settings ? Mission. Under Website content, edit Pastor Kamau or choose Add church leader to add another person. Enter the full name, leadership title, optional biography, and upload a JPEG/PNG/WebP portrait up to 5 MB. Select Publish on the website and save. Draft leaders are hidden from visitors. The same controls work in the desktop office. The initial mission and Pastor Kamau record are applied once; later edits and deletions survive restarts.

## Website announcements

Choose Website content ? Add announcement. Enter a title and short message, optionally add additional details and an HTTPS link. Choose start/end times in Kenya time or leave them blank for immediate/no-expiry display. Check Publish on the website and save. Published active announcements appear below the navigation on all public pages. Timing is checked on page load and every 30 seconds while open; visitors see newly edited content after reloading. Manual dismissal is remembered in sessionStorage for the current browser tab, across navigation and reload. Edit the announcement to change it, unpublish it, or delete it. These are website banners, not SMS, email, or push notifications.

Active announcements also open automatically in an animated home-page welcome dialog. Visitors can close it with Escape, the close button, or Explore our church. Multiple notices have a Next announcement button. The entrance and brief pulse respect reduced-motion preferences. The dialog appears on home-page loads unless manually dismissed in the current tab; other pages retain undismissed banners. No active announcement means no popup.

The home-page announcement popup closes automatically fifteen seconds after opening. Its banner remains available on the page; visitors can also close the popup immediately.

Closing the welcome popup, pressing Escape, or selecting Explore our church dismisses its active notices for the tab. Dismissing a banner hides that notice for the tab. A fresh tab starts a new dismissal session. Automatic fifteen-second closure keeps the banner available and does not mark notices dismissed. Browser restore/duplicate-tab features may preserve session storage.

## Automatic backup protection

Daily backups run at 02:00 Kenya time with 14-day server retention and automatic restore checks. This PC collects Windows-account-encrypted copies hourly while signed in and online, retaining 30 days of downloaded copies. Backups & activity shows server and PC status. See BACKUPS.md for operating limits and recovery steps.

## Website traffic

Administrators can open Website traffic for 7-, 14-, and 30-day public page-request totals, estimated visitor-days, daily traffic, popular pages, devices, referrers, and masked network addresses. No historical data is invented. Full IPs, referrer paths, and URL query strings are not retained. DNT/GPC and common bots are excluded. Country/city lookup is not yet configured.

## Projects, paid events, shop, and sponsors

In Website content choose Add project, Add paid event, Add shop item, or Add sponsor. Entries start as drafts. Add descriptions, photos, dates, and relevant fields. Sponsors require explicit church approval before publication and are labelled Sponsored partner publicly. Published categories appear as links on Home, Our church, and the footer. Empty categories are not promoted.

Projects show a target and office-verified received amount; pledges never count automatically as money received. Paid events and shop items have a KES price and payment instructions or external HTTPS checkout link. Enable Accept pledges, registrations, or orders and publish when ready. Visitors receive a request reference; registration/order submission does not charge them or reserve guaranteed capacity or stock. The office handles confirmation and fulfilment, including digital products.

Orders & registrations lists the latest 500 requests, including project pledges. Admins can mark pending, confirmed, paid, completed, or cancelled and add private notes. Paid requires a verified reference. Checkout links do not automatically confirm payment. Cancellations do not issue refunds. M-Pesa remains disabled until separately configured, and the existing M-Pesa giving totals do not include manually handled commerce payments. All request records are included in database snapshots.


## Watch & Listen and public page updates

- `/watch` provides keyword, platform, preacher, series, category, service/stream date, and upload-date filters, with shareable filter URLs and message links.
- Website content ? Add media / sermon manages drafts, featured messages, categories, descriptions, thumbnails, and multiple platform links for the same service.
- YouTube, Facebook, and TikTok players load only on request. Original links remain available when a platform prevents playback. Channel auto-import is not connected; administrators add links manually. Live now is an administrator-managed label, not automatic live detection.
- Featured and recent messages appear on the homepage. Videos stay hosted by their respective platforms.
- Gallery entries support named albums; ministries support meeting details and a leader; Church settings supports first-visit, transport, and family guidance. Existing church history, leader biographies, and service times remain editable.
- The homepage gives an accurate giving call-to-action while M-Pesa is unavailable.


Channel browsing update: platform buttons now load account content in place. YouTube lists up to 15 recent videos from its public feed (cached for ten minutes), with upload-date and keyword filtering. This is not a full archive import. Facebook uses its public Page timeline widget; TikTok uses its creator profile widget. Those platform-controlled embeds may require sign-in or be unavailable due to account/browser restrictions and are not searchable by our library filters. Full-account links remain available. Admin-curated entries still support richer metadata and service-date filtering.


UI refresh: public pages use consistent modern typography, rounded surfaces, navigation states, and responsive spacing. Watch & Listen now exposes only keyword search, available months (when more than one exists), and newest/oldest order. The selected platform comes from the channel buttons. Month and order use upload date when supplied, otherwise service date. Filters are hidden where no searchable library entries exist; Facebook and TikTok embeds keep their own controls. Preacher, topic, and Bible passage remain searchable text, with no empty metadata dropdowns.


Home slideshow and navigation: the full-width hero starts with the original choir image and rotates through up to five landscape photos from the church image/gallery collection. It offers previous/next and pause controls, pauses on hover/focus and hidden tabs, and respects reduced motion. Navigation stays at the top while scrolling. Social panels use wider desktop layouts; platform widgets still control their internal content and video aspect ratios. Full account archives remain available through the account links; complete searchable imports require authorised platform connections.


Visit and homepage additions: Visit Us includes a Google map at the same church coordinates as the directions link. Hero slides change every five seconds, with the existing pause/reduced-motion controls. Church settings now accepts a WhatsApp number with country code and a homepage YouTube preaching link (including a seconds timestamp). The homepage video requests muted autoplay and provides the player's sound controls; browsers may still require pressing Play. The WhatsApp prompt opens once per tab and plays one short welcome tone only after browser interaction permits audio, with a mute option. Chat opens WhatsApp; it does not send a message automatically. Empty settings hide the relevant component.

Homepage video controls: Church settings includes separate start-minute and start-second inputs. They override timestamps pasted in the video link; saving stores a canonical YouTube timestamp. Existing timestamp links populate the inputs automatically. Clearing the video link hides the homepage player.


On-site chat replaces the WhatsApp redirect. Text us opens a conversation with the church team in the website. An animated invitation, short wiggle, and optional pop sound draw attention without inventing unread messages or online status. Sound requires browser interaction and can be muted; reduced-motion settings disable animation. Visitors consent before sending; no phone or email is required. Conversations continue across pages in the same tab using a random private key. Admin/desktop users reply in Website chats; replies are polled every eight seconds while the page is visible. Inactive threads expire after 30 days; administrators can delete them earlier. Ending a chat removes the browser's access, not the server record. Existing backups retain their normal policy.


Current Text us behavior: a redesigned arrival invitation and attention ring open a local message composer. Send via WhatsApp opens the configured WhatsApp number with an encoded draft; visitors confirm sending in WhatsApp. Drafts are not submitted to the website chat API. The contact form remains available for visitors without WhatsApp. The arrival chime is queued when the prompt appears, plays once browser audio permissions allow it, and is cancelled when the prompt is opened/dismissed. Opening the composer does not itself play a chime. Muting and reduced-motion preferences are respected. Existing website chat records remain available to administrators under the previous retention policy.
