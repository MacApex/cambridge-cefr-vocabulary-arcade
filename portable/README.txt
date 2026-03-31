Cambridge A1-B2 Review Portable Folder
======================================

What this folder is
-------------------
- A self-contained offline vocabulary review bundle for another computer.
- No internet connection is required after the folder is copied over.
- All learning data stays on that computer in the browser's local storage.

Recommended use
---------------
Use the launcher for the target computer:

- macOS: double-click "Open Cambridge A1-B2 Review.command"
- Windows: double-click "Open Cambridge A1-B2 Review.bat"
- Linux: run "./open-cambridge-a1-b2-review.sh"

Those launchers start a tiny local server from this folder and open:
- http://127.0.0.1:<port>/cambridge-a1-b2-review.html

This is the most reliable mode for local progress retention.

Fallback use
------------
If Python 3 is not available on the target computer:

1. Open "cambridge-a1-b2-review.html" directly in Chrome or Edge.
2. If progress does not persist in direct-open mode, install Python 3 and use the launcher instead.

Important notes
---------------
- Copy the whole folder, not just the HTML file.
- Progress is stored per browser profile on the destination computer.
- Clearing browser site data will erase saved progress for this tool.
- Switching to a different browser profile will not carry progress over automatically.

Included files
--------------
- cambridge-a1-b2-review.html
- portable_server.py
- Open Cambridge A1-B2 Review.command
- Open Cambridge A1-B2 Review.bat
- open-cambridge-a1-b2-review.sh

Manual server start
-------------------
If needed, open a terminal in this folder and run:

- macOS / Linux:
  python3 portable_server.py

- Windows:
  py -3 portable_server.py

Then open the printed local URL in the browser.
