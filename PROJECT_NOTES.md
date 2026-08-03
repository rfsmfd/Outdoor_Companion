# Project Notes — How This All Fits Together

Plain-English notes on how the Outdoor Companion project is set up, so it's
easy to pick back up later.

## The three places this project lives

1. **The live website (what the desktop icon opens)**
   - Address: https://rfsmfd.github.io/Outdoor_Companion/
   - This is hosted by **GitHub Pages** — GitHub serves the website straight
     from this repository.
   - The **"Outdoor Companion" desktop icon** is an installed Chrome app that
     opens this exact address in its own window. Using the app day to day =
     clicking that icon.

2. **GitHub (the online home of the code)**
   - Repository: https://github.com/rfsmfd/Outdoor_Companion
   - The `main` branch is the "official" version. Whatever is on `main` is what
     the live website shows.

3. **The local copy (the workshop, on the computer)**
   - Folder: `Claude_Code\Outdoor_Companion` (inside the "OUTDOOR APP" folder
     on the Desktop).
   - This is a clone of the GitHub repo. Edits happen here, then get pushed up.

## How a change flows from edit to live app

```
Edit files locally  ->  push to GitHub (main)  ->  GitHub Pages republishes
                                                     ->  desktop icon shows the update
```

After pushing to `main`, the live site updates automatically, usually within a
minute or two. No manual re-uploading needed.

## The files in this repo

- `index.html` — the entire app (one self-contained file). This is what the
  website and the desktop icon load.
- `README.md` — the project's front-page description on GitHub.
- `PROJECT_NOTES.md` — this file.

## Making changes the tidy way (the workflow used so far)

1. Create a branch:      `git checkout -b my-change`
2. Make the edits.
3. Save them:            `git add .` then `git commit -m "what changed"`
4. Send to GitHub:       `git push -u origin my-change`
5. Open a Pull Request:  `gh pr create`
6. Merge it:             `gh pr merge --squash --delete-branch`

A Pull Request (PR) is just a reviewable "here's a change" before it becomes
official on `main`. For a solo project it's optional, but it keeps a clean,
labeled history of every change.

## Handy facts

- **GitHub is connected** via the GitHub CLI (`gh`), signed in as `rfsmfd`.
- **The app opens the site root**, which serves `index.html`. As long as
  `index.html` exists at the top of the repo, the desktop icon keeps working.
- To run the app locally without touching the live site, open `index.html` in
  a browser (some features like maps/weather need an internet connection).
