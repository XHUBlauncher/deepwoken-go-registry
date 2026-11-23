# Put the shared registry online for free

This version uses GitHub Pages for the webpage and PeerJS/WebRTC for live room connections. It has no Firebase configuration or cloud database. The room host's browser is the live source of registry data.

## Publish the page

1. Create a public GitHub repository, such as `deepwoken-go`.
2. Upload `index.html` and `app.js` to the repository's top level.
3. Open **Settings → Pages**.
4. Choose **Deploy from a branch**, select `main` and `/(root)`, then save.
5. Share the HTTPS address GitHub gives you. It will look like `https://YOUR-USERNAME.github.io/deepwoken-go/`.

GitHub Pages on the free plan requires a public repository. The website files are public; registry entries and coordinates are not in those files. See [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) and [HTTPS on Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).

## Start a shared room

1. Open the same website link on your device.
2. Click **Host Registry** and send the room code to your friend.
3. Your friend opens that link, enters the code, and clicks **Join Room**.
4. Leave the host page open and online while you want the registry shared.

The host browser saves the full registry locally. Other players receive the usernames, reviews, and dates, plus only their own coordinates. The host is the admin and can see all coordinates and remove entries. Use **Download Backup** and **Restore Backup** on the host device to move or recover the registry. Backup files include private coordinates, so keep them private.

## What to expect

- This is a live room, like the party game: the room code connects players directly. If the host closes the page, goes offline, or the browser suspends it, the room stops sharing until the host opens it again.
- Data stays in the host browser's local storage. It is not a permanent cloud database. Keep a backup if the entries matter.
- PeerJS's free shared service helps browsers find each other; the registry data then travels directly between browsers over WebRTC. PeerJS notes that some restrictive networks may not connect without a TURN relay. See [PeerJS Cloud](https://peerjs.com/server/cloud), [PeerJS FAQ](https://peerjs.com/client/faq), and [WebRTC connection setup](https://peerjs.com/client/getting-started).
- The room code is the join key. Share it only with people you want in that room.
- Existing entries from the earlier local version are imported on the host device the first time it hosts, if that browser still has its old local data.

The Firebase project and Firestore database created during the earlier setup are not used by this version.
