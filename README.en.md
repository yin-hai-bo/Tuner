# Tuner

[简体中文](README.md) | English

A free, ad-free WeChat Mini Program for tuning guitars. It analyzes pitch locally through the phone microphone and helps users adjust strings with flat, sharp, and in-tune feedback.

## Features

- Standard six-string guitar tuning: **E2, A2, D3, G3, B3, E4**, from string 6 to string 1, with A4 = 440 Hz.
- Automatic string identification by default. Tap a tuning peg on the headstock to lock a target in manual mode; turn on the Auto switch to resume automatic identification.
- A moving circular marker, deviation numbers, adjustment guidance, and string/peg highlights provide feedback. Stable tuning triggers a checkmark and a success sound.
- Simplified Chinese and English, following the WeChat language by default, with a saved language preference in Settings.
- Microphone permission handling, interruption and retry prompts, and a first-use notice confirmation.

The first automatic identification takes effect immediately. While a target is held and its last valid reading is less than one second old, switching requires two consecutive reliable readings pointing to the same new target. Turning Auto off locks string 6 by default.

The current scope is tuning individual open strings. Other instruments, alternate tunings, chord recognition, and a metronome are not included. Tapping a peg selects a target without playing a reference tone.

## Run locally

Prepare WeChat DevTools, plus Node.js and npm for tests. Tests import TypeScript directly and use Node.js built-in type stripping; the repository tests have been run with Node.js 24.14.0.

1. Obtain the repository and run `npm install` in its root to install development dependencies.
2. Import the repository root into WeChat DevTools using `project.config.json`. The Mini Program source directory is `miniprogram/`.
3. Configure an AppID for your own Mini Program account, compile, and preview in WeChat on a phone.
4. On first use, grant microphone permission and read and accept the usage notice. Pluck one open string at a time near the phone. If permission was denied, tap “Enable microphone” on the page to change it.

Listening stops when leaving the tuning page or the Mini Program. After an interruption or the session duration limit, tap “Continue” as prompted to resume.

## Development and validation

Run from the repository root:

```sh
npm test
npm run test:coverage
```

Tests use the built-in Node.js test runner and cover pitch detection, PCM framing, string selection, stable tuning, recording lifecycle, permissions, and language settings. Synthetic audio and mocked WeChat APIs in automated tests do not replace device validation.

The live pipeline is: WeChat recording frames → PCM decoding → MPM pitch detection → target string and deviation calculation → stability confirmation and UI feedback. Recording currently requests 16 kHz mono PCM, decoded as signed 16-bit little-endian samples. Tuning is confirmed when the raw deviation stays within ±3 cents for at least 250 ms. Displayed numbers are deviation levels: round the absolute cent value, divide by two and round up, then restore the sign. For example, an actual +4 cents displays as +2; this number does not affect tuning confirmation.

For manual validation, pluck each string in a quiet environment and check automatic identification, manual target locking, deviation direction, and success feedback. Also check denied permissions, Tab changes, backgrounding, and interruption recovery. Full acceptance still requires WeChat testing on both iPhone and Android; see the [product scope and development log](docs/product-scope.md) (Chinese) for existing validation records.

## Repository layout

| Path | Contents |
| --- | --- |
| `miniprogram/pages/` | Tuning and Settings pages, plus the retained template logs page |
| `miniprogram/utils/` | Recording, PCM and pitch analysis, tuning rules, language dictionaries |
| `miniprogram/templates/` | Shared usage notice template and styles |
| `miniprogram/assets/` | Headstock, string highlights, and success sound assets |
| `tests/` | Unit and page-flow tests |
| `scripts/` | Audio asset generation tools |
| `docs/product-scope.md` | Product decisions, development log, and pending validation |
| `CONTEXT.md` | Project domain terminology |

Regenerate the success sound with `node scripts/generate-success-tone.mjs`. Run `node scripts/generate-reference-tones.mjs` to generate synthetic reference tones for all six strings; retaining this tool does not mean reference-tone playback is available in the UI.

## Privacy and usage precautions

Audio is used locally for live tuning, without uploads or app-saved recordings. WeChat recording APIs may produce platform-managed temporary files; the app cannot guarantee their immediate deletion. Recording paths matching `wxfile://tmp_<hex>.pcm` and DevTools paths starting with `http://tmp/` are left to the platform; other paths are deleted where possible, with a retry prompt on failure.

Automatic identification infers a target from pitch and may select another string when a string is far out of tune. Manual mode only fixes the target pitch and cannot verify which string is being plucked or adjusted. Match the selected string number, physical string, and tuning peg before adjusting; work slowly and avoid overtightening. The full usage notice is available in the Mini Program Settings.

## Contributing and license

Follow [AGENTS.md](AGENTS.md): keep changes small and independent, test business rules and edge cases, and wait for review after each step. Do not create Git commits without explicit instructions.

This project is licensed under the [MIT License](LICENSE).
