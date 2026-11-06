# Winner Stays On

1v1 penalty shootout. Winner stays on, loser joins the back of the queue. No sign-in.

## Run on your computer
Needs Node 18 or newer.

    npm install
    npm start

Then open http://localhost:3000

## Put it online with Render
1. Upload everything in this folder to a new GitHub repository. Leave out `node_modules`.
2. In Render, create a new Web Service from that repository.
3. Use build command `npm install` and start command `npm start`, on the Free plan.
4. Share the `onrender.com` address Render gives you.

`render.yaml` is included if you prefer Render's Blueprint option.

## Good to know
- On Render's free plan the site sleeps after 15 minutes with no traffic and takes about a minute to wake.
- The free plan has no permanent storage, so the ranking resets on restart, redeploy or sleep. To keep it, use a paid plan with a disk and set `DATA_DIR` to the disk path.
- Everyone who opens the site shares one room, with up to 200 players.
