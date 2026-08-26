# AppliTrail Job Importer

This Chrome and Microsoft Edge extension captures a job advertisement only when the user selects **Capture & review in AppliTrail**. It opens the user's AppliTrail dashboard and requires them to review all captured details before saving an application.

## Install for beta testing

1. Download the versioned `applitrail-job-importer-v1.1.5.zip` package from AppliTrail.
2. Unzip it to a folder you will keep.
3. In Chrome, open `chrome://extensions`; in Edge, open `edge://extensions`.
4. Turn on **Developer mode**, choose **Load unpacked**, and select the unzipped folder.
5. Pin **AppliTrail Job Importer** and sign in to AppliTrail in the browser.

The extension uses the current tab only after the user presses the capture button. It does not submit job applications or read a user's AppliTrail data.

## LinkedIn job pages

Version 1.1.5 anchors extraction to the selected job title and also reads the bounded visible header around that title. This captures LinkedIn salary, location, workplace arrangement and employment type even when signed-in LinkedIn pages rename or remove their internal CSS classes. It still reads preference chips, job-criteria fields, the base-pay section and the visible **About the job** content. Search results and search keywords are excluded from workplace-type detection. LinkedIn tracking parameters are also removed from the saved job link when a job ID is available.

## Indeed job pages

Version 1.1.2 captures Indeed's visible **Full job description** section using both Indeed-specific page fields and a heading-based fallback. This keeps the description available even when Indeed changes its internal page class names.
