# Sharper

Sharper is a web-based collection of minigames designed to train working memory.

Each game presents a different memory challenge and automatically adjusts its difficulty based on the player's performance. The goal is to encourage short, focused practice sessions rather than extended gameplay.

## Games

Sharper currently includes four games:

- **Memory** – Remember and match pairs of numbered cards.
- **Lights** – Memorize and reproduce sequences of flashing lights.
- **Words** – Remember previously displayed words as new words appear.
- **Cups** – Track numbered objects as their positions are swapped.

All four games support keyboard navigation and screen readers.

## Features

- **Adaptive difficulty:** Games automatically become easier or harder depending on performance.
- **Daily time limits:** Each game has a five-minute daily allowance.
- **Progress tracking:** Registered players' progress is saved across sessions.
- **Unlockable games:** Additional games become available as players complete days of practice.
- **Demo mode:** Visitors can try Memory without creating an account.
- **Accessibility:** Games support keyboard interaction and provide screen-reader announcements for gameplay.
- **Responsive design:** The interface works across desktop and mobile devices.

Daily allowances reset at midnight in the `Europe/Stockholm` time zone. Once the daily allowance expires, players can finish their current session before the game becomes unavailable for the day.

## Tech Stack

| Technology | Purpose |
|---|---|
| [Astro](https://astro.build/) | Website framework |
| [Sanity](https://www.sanity.io/) | Game content management |
| [Firebase Authentication](https://firebase.google.com/docs/auth) | User authentication |
| [Cloud Firestore](https://firebase.google.com/docs/firestore) | Player progress and time limits |
| [Vercel](https://vercel.com/) | Hosting and deployment |

## Getting Started

### Prerequisites

- Node.js
- npm
- A Firebase project
- A Sanity project

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/LB552/Sharper2.git
cd Sharper2
npm install
```

### Environment Variables

Configure the environment variables required by the Firebase and Sanity integrations.

Firebase configuration values used in browser-side Astro code must use the `PUBLIC_` prefix.

Keep credentials and other secrets out of version control.

### Development

Start the Astro development server:

```bash
npm run dev
```

Open the local URL displayed in the terminal.

### Production Build

Build the website:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Project Structure

```text
src/
├── components/
│   ├── GameShell.astro
│   └── Header.astro
├── games/
│   ├── Memory.astro
│   ├── Lights.astro
│   ├── Words.astro
│   └── Cups.astro
├── layouts/
│   └── Layout.astro
├── pages/
│   ├── index.astro
│   ├── login.astro
│   └── [slug].astro
├── utils/
│   ├── authHandler.js
│   └── gameController.js
├── firebase.js
└── index.css

sanity/
└── schemas/
    └── game.js
```

The games share common functionality through `GameShell.astro` and `gameController.js`, including session management, difficulty progression, daily time limits, and feedback.

Each game implements its own gameplay mechanics.

## Player Progress

Registered players' data is stored in Cloud Firestore.

The main collections are:

- `users` – User profiles.
- `gameSaves` – Saved game progress and difficulty.
- `gameTimeLimits` – Daily game time limits.

Guests can access the Memory demo without registering. Guest progress is not transferred when an account is created.

## Accessibility

Sharper is designed to support both mouse and keyboard interaction.

Accessibility features include:

- Keyboard-operable gameplay controls.
- Visible keyboard focus indicators.
- Screen-reader descriptions and announcements.
- Accessible feedback for game results.
- Semantic navigation and page structure.

Accessibility support aims to communicate the same gameplay information through different input and output methods while preserving each game's core challenge.

## Deployment

Sharper is deployed using Vercel.

The production deployment requires the appropriate environment variables and access to the configured Firebase and Sanity projects.

## License

This project is licensed under the MIT License. See the LICENSE file for details.

Copyright © 2026 Anton Börnfelt.