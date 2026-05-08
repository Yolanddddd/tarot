Put your Rider-Waite card images in this folder.

The easiest path is to name each file with the app's `cardId`, for example:

- `major-00-the-fool.jpg`
- `major-01-the-magician.jpg`
- `cups-ace.jpg`
- `wands-queen.jpg`

If you want custom filenames or nested folders, register them in
`manifest.json`.

Example override:

```json
{
  "cards": {
    "major-00-the-fool": "major-00-the-fool.jpg",
    "cups-ace": "cups-ace.jpg"
  }
}
```

If a card is missing from the manifest, the app first tries the conventional
`cardId.jpg` path and then falls back to a generated placeholder face.
