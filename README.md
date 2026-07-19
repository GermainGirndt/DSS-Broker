# DSS-Broker

DSS-Broker is a single-page family bakery ordering application. It collects each person’s bread requests, records fallback choices, and creates a grouped pickup list for use at the bakery.

The app is designed for the real-world case where bakery inventory is unknown in advance. Orders are processed one at a time in a fair sequence. If a bread category becomes unavailable, all remaining requests automatically advance to their chosen alternatives.

## Features

- Manage the available bread catalog.
- Add and remove family members.
- Add multiple bread orders for each person with click-based controls.
- Build recursive fallback sequences such as:

  ```text
  Tomatine-Bread → DSS-Bread → Pfferbrezel-Bread
  ```

- Visualize primary and fallback choices inside every family order.
- Minimize individual person cards while keeping their compact order summary visible.
- Group active order items by product in the Pickup List.
- Process bakery responses with `Concluded` and `Not available` actions.
- Highlight fallback results:
  - Green: picked up
  - Red: unavailable
  - Gray: no longer needed after a successful choice
- Undo Pickup List actions without removing orders added afterward.
- Persist application state in browser localStorage.
- Clear all saved data from the global header action.
- Responsive layouts for desktop, tablet, and mobile devices.
- No authentication, account, backend, or database required.

## Bakery workflow

### 1. Prepare the bread catalog

Add every bread that family members may request. Catalog entries can also be removed. The catalog represents possible choices, not known bakery stock.

### 2. Create family orders

Add a family member and select their primary bread. After the first selection, additional bread clicks extend that item’s fallback sequence. Select **Done with alternatives** to finish the chain and begin another order item.

Each person card contains:

- Their complete order-item list
- Visual fallback sequences
- Controls for adding and deleting order items
- A compact product-grouped order summary
- Controls for minimizing or removing the person

### 3. Process the Pickup List

The Pickup List groups the currently effective requests by bread. Because the available quantity is unknown, DSS-Broker highlights one **Ask next · fair turn** item for each category.

- Select **Concluded** when that bread is received.
- Select **Not available** when the bakery has no more of that category.
- Remaining affected requests move to their next fallback automatically.
- Previously concluded requests remain concluded.
- Orders without a remaining alternative appear under **No alternative remaining**.

### Fair ordering

The next turn is selected using each person’s fulfilled-to-requested ratio. A person with a lower fulfilled share receives priority. Equal candidates use a deterministic tie-breaker, keeping the ordering stable rather than randomly changing on every render.

The visible Pickup List order is independent from the fairness calculation, so concluded rows remain in their original position while the next-turn highlight moves.

## Order-item states

```typescript
type OrderItemStatus = "Not Processed" | "Concluded" | "Non Available";
```

| Status          | Meaning                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| `Not Processed` | The bakery request has not been resolved yet.                               |
| `Concluded`     | The bread was successfully picked up.                                       |
| `Non Available` | The bread could not be supplied; processing continues with its alternative. |

The public domain interfaces live in [`app/interfaces.ts`](app/interfaces.ts):

```typescript
interface Person {
  name: string;
  order: Order;
}

interface Order {
  person: Person;
  items: OrderItem[];
}

interface Product {
  name: string;
}

interface OrderItem {
  product: Product;
  alternativeOrderItem: OrderItem | null;
  status: "Not Processed" | "Concluded" | "Non Available";
}
```

An alternative is another `OrderItem`, allowing fallback chains of any length.

## Local persistence

Application state is stored under the following versioned browser key:

```text
dss-broker:state:v1
```

Persisted data includes:

- Products
- People and orders
- Complete fallback chains
- Processing statuses
- Known unavailable categories
- Minimized person cards
- In-progress alternative selection
- Pickup List undo history

Data is local to the current browser and device. It is not synchronized or backed up remotely. Browser storage restrictions, clearing site data, or using another device will make the saved state unavailable.

Use **Clear saved data** in the header to remove the stored state and restore the starter example. The action requires confirmation.

## Technology

- [Next.js](https://nextjs.org/) 16 with the App Router
- [React](https://react.dev/) 19
- TypeScript
- Tailwind CSS 4 tooling with application styling in `app/globals.css`
- Browser localStorage for persistence

The interactive page is a client component. No API routes or external services are required.

## Getting started

### Requirements

- Node.js `20.9.0` or newer
- npm

### Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Quality checks

```bash
npm run lint
npm run build
```

### Production mode

```bash
npm run build
npm run start
```

## GitHub Pages build

Run the root-level build helper from the repository root:

```bash
./build-project.py
```

The script installs locked dependencies, detects the repository name from the Git remote, configures the matching base path, and creates a static Next.js export in `public/`. It also generates the root `index.html` redirect with the same social-sharing metadata. Publish the repository root so both `index.html` and `public/` are available.

Override the automatically detected base path when necessary:

```bash
./build-project.py /my-repository
```

Use `/` for a root-domain or `<username>.github.io` deployment:

```bash
./build-project.py /
```

Optional environment variables:

| Variable                 | Purpose                                                 |
| ------------------------ | ------------------------------------------------------- |
| `GITHUB_PAGES_BASE_PATH` | Base-path alternative to the positional argument.       |
| `GITHUB_PAGES_CNAME`     | Writes a custom domain to the root-level `CNAME`.       |
| `GITHUB_PAGES_URL`       | Overrides the full public URL used for sharing metadata. |
| `SKIP_INSTALL=1`         | Skips `npm ci` when dependencies are already installed. |

## Project structure

```text
DSS-Broker/
├── index.html             # Generated redirect and social-sharing metadata
├── build-project.py       # One-command GitHub Pages static build
├── public/                # Generated GitHub Pages deployment files
└── dss-broker/
    ├── app/
    │   ├── globals.css    # Global design and responsive behavior
    │   ├── interfaces.ts  # Public domain interfaces
    │   ├── layout.tsx     # Root layout and metadata
    │   ├── opengraph-image.png # Social-sharing preview image
    │   └── page.tsx       # Application state, workflows, and UI
    ├── public/            # Static assets
    ├── package.json       # Dependencies and scripts
    └── next.config.ts     # Next.js configuration
```

## Important implementation details

- Order alternatives form a singly linked recursive chain through `alternativeOrderItem`.
- Client-side IDs identify people and order-item nodes for safe nested updates.
- Bakery availability is learned dynamically; the app intentionally has no quantity-entry feature.
- Marking a category unavailable affects pending instances of that product across all fallback chains.
- Undo history stores status-level changes rather than whole-state replacements, preserving subsequently added orders.
- Starter IDs are deterministic to keep server rendering and browser hydration consistent.
- Persisted data uses a schema version so future changes can migrate or safely discard incompatible history.

## Privacy and scope

DSS-Broker does not transmit order data. All persisted information remains in the browser’s localStorage. The application is intended for a single household using one browser profile; multi-user synchronization and cross-device sharing are outside the current scope.
