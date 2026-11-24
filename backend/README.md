# Backend setup

1. From this directory, install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and replace the MongoDB URI placeholders with your own connection string.
3. Start the API with `npm run dev`.
4. Open `http://localhost:5000/api/health`. The response shows whether MongoDB is connected.

The health endpoint only reports service and database status. Authentication and document authorization are added in later steps.
