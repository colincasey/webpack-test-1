1. Deploy to Heroku

```
heroku create
heroku stack:set heroku-24
git push heroku main
```

Run it and the process should fail.

2. Increase the memory

Change the `build` script in `package.json` to the following:

```
"build": "NODE_OPTIONS=\"--max_old_space_size=5000\" node --require ./memory.cjs ./node_modules/.bin/webpack --stats=errors-only"
```

Then push the changes:

```
git add . && git commit -m "increase max heap size" && git push heroku main
```
