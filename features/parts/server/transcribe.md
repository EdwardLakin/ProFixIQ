If you want voice receiving, add:
- /api/transcribe (POST audio blob) -> Whisper/OpenAI -> text
- Parse "receive 3 brake pads to main" -> {qty:3, part:"brake pads", loc:"MAIN"}
