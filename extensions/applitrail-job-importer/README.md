# AppliTrail Job Importer

This Chrome and Microsoft Edge extension captures a job advertisement only when the user selects **Capture & review in AppliTrail**. It opens the user's AppliTrail dashboard and requires them to review all captured details before saving an application.

## Install for beta testing

1. Download the `applitrail-job-importer.zip` package from AppliTrail.
2. Unzip it to a folder you will keep.
3. In Chrome, open `chrome://extensions`; in Edge, open `edge://extensions`.
4. Turn on **Developer mode**, choose **Load unpacked**, and select the unzipped folder.
5. Pin **AppliTrail Job Importer** and sign in to AppliTrail in the browser.

The extension uses the current tab only after the user presses the capture button. It does not submit job applications or read a user's AppliTrail data.

## LinkedIn job pages

Version 1.1.1 prioritizes the currently selected LinkedIn job panel. It captures the company and title from the job header, the location and workplace/employment labels shown with that job, and locates the visible **About the job** heading even when LinkedIn changes its CSS class names. Search results and search keywords are excluded from workplace-type detection. LinkedIn tracking parameters are also removed from the saved job link when a job ID is available.
