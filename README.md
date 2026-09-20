# Sam3D

Sam3D is an interactive 3D spatial plane featuring three distinct sonas:
- **Sam** (Red)
- **Cam** (Green)
- **Evil Sam** (Blue)

Characters navigate across the 3D plane in response to HTTP `PUT /Move` requests.

---

## HTTP Movement Specification

To move a character across the plane, dispatch an HTTP request:

- **Method**: `PUT`
- **Path**: `/Move`
- **Headers**: `Content-Type: application/json`
- **Body**:
  ```json
  {
    "Who": "Sam",
    "Where": "10, 0, 5"
  }
  ```

### Parameters
- **`Who`**: The character sona to move (`"Sam"`, `"Cam"`, or `"Evil Sam"`).
- **`Where`**: Target coordinate string formatted as `"X, Y, Z"` (e.g. `"10, 0, 5"` or `"-8, 0, 12"`).

### Example cURL Commands

```bash
# Move Sam (Red)
curl -X PUT http://localhost:3000/Move \
  -H "Content-Type: application/json" \
  -d '{"Who": "Sam", "Where": "8, 0, 10"}'

# Move Cam (Green)
curl -X PUT http://localhost:3000/Move \
  -H "Content-Type: application/json" \
  -d '{"Who": "Cam", "Where": "-12, 0, -6"}'

# Move Evil Sam (Blue)
curl -X PUT http://localhost:3000/Move \
  -H "Content-Type: application/json" \
  -d '{"Who": "Evil Sam", "Where": "5, 0, -14"}'
```

---

## Running Locally

1. Start the server:
   ```bash
   npm start
   ```
2. Open your browser to `http://localhost:3000`.

You can also open `index.html` directly in any modern browser.
