"use client";

import { useEffect, useMemo, useState } from "react";
import type { OrderItem, Product } from "./interfaces";

type ItemNode = OrderItem & { id: string; alternativeOrderItem: ItemNode | null };
type FamilyOrder = { id: string; name: string; items: ItemNode[] };
type CatalogProduct = { name: string };
type SummaryItem = { personId: string; personName: string; item: ItemNode; isNext?: boolean };
type AlternativeDraft = { rootId: string; targetId: string; targetName: string; chain: string[] };
type PickupHistoryEntry = {
  previousOrders: FamilyOrder[];
  previousUnavailableProducts: Set<string>;
  message: string;
};
type PersistedAppState = {
  version: 1;
  products: CatalogProduct[];
  orders: FamilyOrder[];
  unavailableProducts: string[];
  alternativeDrafts: Record<string, AlternativeDraft>;
  pickupHistory: Array<Omit<PickupHistoryEntry, "previousUnavailableProducts"> & { previousUnavailableProducts: string[] }>;
};

const STORAGE_KEY = "dss-broker:state:v1";

const product = (name: string): Product => ({ name });
const item = (name: string, alternative: ItemNode | null = null, id = crypto.randomUUID()): ItemNode => ({
  id,
  product: product(name),
  alternativeOrderItem: alternative,
  status: "Not Processed",
});

const starterProductNames = [
  "Tomatine-Bread",
  "DSS-Bread",
  "Pfferbrezel-Bread",
  "Vinschgauer-Bread",
  "Bauernweckla",
  "Vollkornbrötchen-Bread",
];

const starterProducts: CatalogProduct[] = starterProductNames.map((name) => ({ name }));

function starterOrders(): FamilyOrder[] {
  return [
    {
      id: "starter-person-germain",
      name: "Germain",
      items: [
        item("Tomatine-Bread", item("DSS-Bread", item("Pfferbrezel-Bread", null, "starter-germain-pffer"), "starter-germain-dss"), "starter-germain-tomatine"),
        item("Vinschgauer-Bread", item("Bauernweckla", null, "starter-germain-bauern"), "starter-germain-vinschgauer"),
      ],
    },
    {
      id: "starter-person-johanna",
      name: "Johanna",
      items: [
        item("Pfferbrezel-Bread", item("Vollkornbrötchen-Bread", null, "starter-johanna-vollkorn"), "starter-johanna-pffer"),
        item("Tomatine-Bread", null, "starter-johanna-tomatine"),
      ],
    },
  ];
}

function activeItem(node: ItemNode): ItemNode | null {
  if (node.status !== "Non Available") return node;
  return node.alternativeOrderItem ? activeItem(node.alternativeOrderItem) : null;
}

function itemSequence(node: ItemNode) {
  const sequence: ItemNode[] = [];
  let current: ItemNode | null = node;
  while (current) {
    sequence.push(current);
    current = current.alternativeOrderItem;
  }
  return sequence;
}

function stableTieBreaker(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function markProductUnavailable(node: ItemNode, productName: string): ItemNode {
  return {
    ...node,
    status: node.product.name === productName && node.status !== "Concluded" ? "Non Available" : node.status,
    alternativeOrderItem: node.alternativeOrderItem
      ? markProductUnavailable(node.alternativeOrderItem, productName)
      : null,
  };
}

function tallyItems(items: ItemNode[]) {
  const tally = new Map<string, number>();
  items.forEach((root) => {
    const current = activeItem(root);
    if (current) tally.set(current.product.name, (tally.get(current.product.name) ?? 0) + 1);
  });
  return [...tally.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function updateNode(node: ItemNode, id: string, update: (value: ItemNode) => ItemNode): ItemNode {
  if (node.id === id) return update(node);
  return node.alternativeOrderItem
    ? { ...node, alternativeOrderItem: updateNode(node.alternativeOrderItem, id, update) }
    : node;
}

function Icon({ name }: { name: "bread" | "people" | "basket" | "plus" | "check" | "x" | "arrow" | "trash" | "undo" }) {
  const paths = {
    bread: <><path d="M6 9.5C3.8 9.5 2 7.9 2 6s1.8-3.5 4-3.5c.8-1 2-1.5 3.2-1.5 1.8 0 3.3 1 4 2.4.5-.2 1-.4 1.6-.4C17.1 3 19 4.8 19 7v8.5c0 1.4-1.1 2.5-2.5 2.5h-11C4.1 18 3 16.9 3 15.5V8.8"/><path d="M7 6.5 9 5m2.5 1.5 2-1.5"/></>,
    people: <><circle cx="8" cy="7" r="3"/><path d="M2.5 18c.4-3.2 2.2-5 5.5-5s5.1 1.8 5.5 5M14 5.2a3 3 0 0 1 0 5.6M15.5 13c2.4.3 3.7 2 4 5"/></>,
    basket: <><path d="m4 8 2 10h12l2-10H4Z"/><path d="m8 8 4-6 4 6M2 8h20M9 11v4m6-4v4"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    x: <path d="m6 6 12 12M18 6 6 18"/>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
    trash: <><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></>,
    undo: <><path d="M9 7 4 12l5 5"/><path d="M4 12h9a6 6 0 0 1 6 6"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function Home() {
  const [products, setProducts] = useState(starterProducts);
  const [orders, setOrders] = useState<FamilyOrder[]>(starterOrders);
  const [newProduct, setNewProduct] = useState("");
  const [newPerson, setNewPerson] = useState("");
  const [unavailableProducts, setUnavailableProducts] = useState<Set<string>>(() => new Set());
  const [alternativeDrafts, setAlternativeDrafts] = useState<Record<string, AlternativeDraft>>({});
  const [pickupHistory, setPickupHistory] = useState<PickupHistoryEntry[]>([]);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const rawState = window.localStorage.getItem(STORAGE_KEY);
        if (!rawState) return;
        const savedState = JSON.parse(rawState) as Partial<PersistedAppState>;
        if (savedState.version !== 1 || !Array.isArray(savedState.products) || !Array.isArray(savedState.orders)) return;

        setProducts(savedState.products);
        setOrders(savedState.orders);
        setUnavailableProducts(new Set(Array.isArray(savedState.unavailableProducts) ? savedState.unavailableProducts : []));
        setAlternativeDrafts(savedState.alternativeDrafts && typeof savedState.alternativeDrafts === "object" ? savedState.alternativeDrafts : {});
        setPickupHistory(Array.isArray(savedState.pickupHistory) ? savedState.pickupHistory.map((entry) => ({
          previousOrders: entry.previousOrders,
          previousUnavailableProducts: new Set(entry.previousUnavailableProducts),
          message: entry.message,
        })) : []);
      } catch {
        // Ignore corrupt or inaccessible storage and keep the starter state.
      } finally {
        if (!cancelled) setStorageReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const stateToPersist: PersistedAppState = {
      version: 1,
      products,
      orders,
      unavailableProducts: [...unavailableProducts],
      alternativeDrafts,
      pickupHistory: pickupHistory.map((entry) => ({
        previousOrders: entry.previousOrders,
        previousUnavailableProducts: [...entry.previousUnavailableProducts],
        message: entry.message,
      })),
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToPersist));
    } catch {
      // The app remains usable if storage is blocked or full.
    }
  }, [alternativeDrafts, orders, pickupHistory, products, storageReady, unavailableProducts]);

  const summary = useMemo(() => {
    const grouped = new Map<string, SummaryItem[]>();
    orders.forEach((person) => person.items.forEach((root) => {
      const current = activeItem(root);
      if (!current) return;
      grouped.set(current.product.name, [...(grouped.get(current.product.name) ?? []), { personId: person.id, personName: person.name, item: current }]);
    }));
    const fulfilledByPerson = new Map(orders.map((person) => [person.id, person.items.filter((root) => activeItem(root)?.status === "Concluded").length]));
    const requestedByPerson = new Map(orders.map((person) => [person.id, person.items.length]));
    const fairGroups: Array<[string, SummaryItem[]]> = [...grouped.entries()].map(([name, entries]) => {
      const pending = entries.filter((entry) => entry.item.status !== "Concluded").sort((a, b) => {
        const aRatio = (fulfilledByPerson.get(a.personId) ?? 0) / (requestedByPerson.get(a.personId) || 1);
        const bRatio = (fulfilledByPerson.get(b.personId) ?? 0) / (requestedByPerson.get(b.personId) || 1);
        if (aRatio !== bRatio) return aRatio - bRatio;
        return stableTieBreaker(`${name}:${a.personId}:${a.item.id}`) - stableTieBreaker(`${name}:${b.personId}:${b.item.id}`);
      });
      const nextItemId = pending[0]?.item.id;
      const stableDisplayOrder = [...entries].sort((a, b) =>
        stableTieBreaker(`${name}:${a.personId}:${a.item.id}`) - stableTieBreaker(`${name}:${b.personId}:${b.item.id}`));
      return [name, stableDisplayOrder.map((entry) => ({ ...entry, isNext: entry.item.id === nextItemId }))];
    });
    return fairGroups.sort(([a], [b]) => a.localeCompare(b));
  }, [orders]);

  const unfulfilledOrders = orders.flatMap((person) => person.items
    .filter((root) => !activeItem(root))
    .map((root) => ({ personName: person.name, root })));

  const addProduct = () => {
    const name = newProduct.trim();
    if (!name || products.some((entry) => entry.name.toLowerCase() === name.toLowerCase())) return;
    setProducts((current) => [...current, { name }]);
    setPickupHistory([]);
    setNewProduct("");
  };

  const deleteProduct = (productName: string) => {
    setProducts((current) => current.filter((entry) => entry.name !== productName));
    setUnavailableProducts((current) => {
      const next = new Set(current);
      next.delete(productName);
      return next;
    });
    setPickupHistory([]);
  };

  const addPerson = () => {
    const name = newPerson.trim();
    if (!name) return;
    setOrders((current) => [...current, { id: crypto.randomUUID(), name, items: [] }]);
    setPickupHistory([]);
    setNewPerson("");
  };

  const changeItem = (personId: string, itemId: string, update: (node: ItemNode) => ItemNode) => {
    setOrders((current) => current.map((person) => person.id === personId
      ? { ...person, items: person.items.map((node) => updateNode(node, itemId, update)) }
      : person));
  };

  const chooseBread = (personId: string, productName: string) => {
    const draft = alternativeDrafts[personId];
    const nextItem = item(productName);

    if (!draft) {
      setOrders((current) => current.map((person) => person.id === personId
        ? { ...person, items: [...person.items, nextItem] }
        : person));
      setAlternativeDrafts((current) => ({ ...current, [personId]: { rootId: nextItem.id, targetId: nextItem.id, targetName: productName, chain: [productName] } }));
      setPickupHistory([]);
      return;
    }

    changeItem(personId, draft.targetId, (current) => ({ ...current, alternativeOrderItem: nextItem }));
    setAlternativeDrafts((current) => ({ ...current, [personId]: { ...draft, targetId: nextItem.id, targetName: productName, chain: [...draft.chain, productName] } }));
    setPickupHistory([]);
  };

  const finishAlternatives = (personId: string) => {
    setAlternativeDrafts((current) => {
      const next = { ...current };
      delete next[personId];
      return next;
    });
  };

  const deleteItem = (personId: string, itemId: string) => {
    setOrders((current) => current.map((person) => person.id === personId
      ? { ...person, items: person.items.filter((node) => node.id !== itemId) }
      : person));
    if (alternativeDrafts[personId]?.rootId === itemId) finishAlternatives(personId);
    setPickupHistory([]);
  };

  const rememberPickupAction = (message: string) => {
    setPickupHistory((current) => [...current, {
      previousOrders: orders,
      previousUnavailableProducts: new Set(unavailableProducts),
      message,
    }].slice(-20));
  };

  const markConcluded = (entry: SummaryItem) => {
    if (entry.item.status === "Concluded") return;
    rememberPickupAction(`${entry.personName}’s ${entry.item.product.name} was marked concluded.`);
    changeItem(entry.personId, entry.item.id, (current) => ({ ...current, status: "Concluded" }));
  };

  const undoLastPickupAction = () => {
    const lastAction = pickupHistory[pickupHistory.length - 1];
    if (!lastAction) return;
    setOrders(lastAction.previousOrders);
    setUnavailableProducts(new Set(lastAction.previousUnavailableProducts));
    setPickupHistory((current) => current.slice(0, -1));
  };

  const markUnavailable = (entry: SummaryItem) => {
    rememberPickupAction(`${entry.item.product.name} was marked unavailable; remaining orders moved to alternatives.`);
    const knownUnavailable = new Set(unavailableProducts).add(entry.item.product.name);
    const nextOrders = orders.map((person) => ({
      ...person,
      items: person.items.map((node) => markProductUnavailable(node, entry.item.product.name)),
    }));
    setUnavailableProducts(knownUnavailable);
    setOrders(nextOrders);
  };

  return (
    <main>
      <header className="hero">
        <div className="brand-mark"><Icon name="bread" /></div>
        <div>
          <p className="eyebrow">THE FAMILY BAKERY LIST</p>
          <h1>DSS-Broker</h1>
          <p className="subtitle">Bread plans, with a plan B.</p>
        </div>
        <div className="today"><span>Today&apos;s order</span><strong>{summary.reduce((sum, [, names]) => sum + names.length, 0)} items</strong></div>
      </header>

      <section className="workspace">
        <div className="section-heading">
          <span className="number">01</span>
          <div><p className="eyebrow">FIRST, FILL THE SHELF</p><h2>Available breads</h2></div>
        </div>
        <div className="product-bar">
          <div className="chips">
            {products.map(({ name }) => <span className="chip" key={name}><span className="grain">✦</span><span>{name}</span><button onClick={() => deleteProduct(name)} aria-label={`Delete ${name} from available breads`} title="Delete available bread"><Icon name="x" /></button></span>)}
          </div>
          <form className="inline-form" onSubmit={(event) => { event.preventDefault(); addProduct(); }}>
            <label htmlFor="product">Add a bread</label>
            <div><input id="product" value={newProduct} onChange={(event) => setNewProduct(event.target.value)} placeholder="e.g. Sourdough" /><button aria-label="Add bread"><Icon name="plus" /></button></div>
          </form>
        </div>

        <div className="section-heading family-heading">
          <span className="number">02</span>
          <div><p className="eyebrow">THEN, BUILD THE ORDER</p><h2>Family orders</h2></div>
          <form className="person-form" onSubmit={(event) => { event.preventDefault(); addPerson(); }}>
            <input aria-label="Family member name" value={newPerson} onChange={(event) => setNewPerson(event.target.value)} placeholder="Family member name" />
            <button><Icon name="people" /> Add person</button>
          </form>
        </div>

        <div className="order-grid">
          {orders.map((person) => (
            <article className="person-card" key={person.id}>
              <div className="person-title"><div className="avatar">{person.name.charAt(0).toUpperCase()}</div><div><h3>{person.name}</h3><p>{person.items.length} {person.items.length === 1 ? "item" : "items"}</p></div></div>
              <div className="item-list">
                {person.items.map((orderItem, index) => (
                  <OrderRow key={orderItem.id} node={orderItem} index={index + 1} onDelete={() => deleteItem(person.id, orderItem.id)} />
                ))}
                {person.items.length === 0 && <p className="empty">No bread selected yet.</p>}
              </div>
              <div className={`add-order ${alternativeDrafts[person.id] ? "choosing-alternative" : ""}`}>
                {alternativeDrafts[person.id] ? <div className="alternative-prompt"><div><span>Choose an alternative for</span><strong>{alternativeDrafts[person.id].targetName}</strong><small>Click another bread to extend the fallback chain.</small></div><button onClick={() => finishAlternatives(person.id)}><Icon name="check" />Done with alternatives</button></div> : <><span>Add to {person.name}&apos;s order</span><small className="choice-hint">Choose a bread, then optionally choose its alternatives.</small></>}
                <div className="bread-choices">{products.map(({ name }) => { const alreadyInChain = alternativeDrafts[person.id]?.chain.includes(name); return <button key={name} disabled={alreadyInChain} onClick={() => chooseBread(person.id, name)}>{alternativeDrafts[person.id] ? <Icon name="arrow" /> : <Icon name="plus" />}{name}</button>; })}</div>
              </div>
              <div className="person-summary"><span>Order summary</span>{tallyItems(person.items).length > 0 ? <div>{tallyItems(person.items).map(([name, count]) => <span className="person-summary-item" key={name}><strong>{count}×</strong>{name}</span>)}</div> : <small>Nothing ordered yet</small>}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="summary-section">
        <div className="summary-intro"><span className="number light">03</span><p className="eyebrow">READY FOR THE COUNTER</p><h2>Bakery summary</h2><p>No stock estimate needed. Ask for the highlighted family order first; every successful pickup updates the next fairest turn. If the bakery runs out, all remaining requests move to their alternatives.</p><div className="counter-guide"><span><strong>1</strong>Ask highlighted order</span><span><strong>2</strong>Record the answer</span><span><strong>3</strong>Continue with the next turn</span></div></div>
        <div className="receipt">
          <div className="receipt-top"><div><Icon name="basket" /><span>PICKUP LIST</span></div><strong>{summary.reduce((sum, [, names]) => sum + names.length, 0)} TOTAL</strong></div>
          {pickupHistory.length > 0 && <div className="undo-notice" role="status" aria-live="polite"><div><Icon name="undo" /><span><strong>Last action</strong>{pickupHistory[pickupHistory.length - 1].message}</span></div><button onClick={undoLastPickupAction}><Icon name="undo" />Undo{pickupHistory.length > 1 && <small>{pickupHistory.length} steps</small>}</button></div>}
          {summary.map(([name, entries]) => <div className="summary-row" key={name}><span className="quantity">{entries.length}×</span><div className="summary-product"><strong>{name}</strong><small>for {entries.map((entry) => entry.personName).join(", ")}</small><div className="summary-actions">{entries.map((entry) => { const concluded = entry.item.status === "Concluded"; return <div className={`summary-action ${entry.isNext ? "next-turn" : ""}`} key={entry.item.id}><span>{entry.personName}{entry.isNext && <small className="queue-position">Ask next · fair turn</small>}{!entry.isNext && !concluded && <small className="queue-position waiting">Waiting for turn</small>}<em className={concluded ? "done" : "pending"}>{entry.item.status}</em></span><button disabled={!entry.isNext} className={`success ${concluded ? "active" : ""}`} onClick={() => markConcluded(entry)}><Icon name="check" />Concluded</button><button disabled={!entry.isNext} className="danger" onClick={() => markUnavailable(entry)}><Icon name="x" />Not available</button></div>; })}</div></div></div>)}
          {unfulfilledOrders.length > 0 && <div className="unfulfilled-list"><strong>No alternative remaining</strong>{unfulfilledOrders.map(({ personName, root }) => <div key={root.id}><Icon name="x" /><span>{personName}<small>{root.product.name} and every chosen alternative were unavailable</small></span></div>)}</div>}
          {summary.length === 0 && <p className="summary-empty">Your basket is empty.</p>}
          <div className="receipt-bottom"><span>GOOD TO GO</span><span>✦ DSS · BAKERY ✦</span></div>
        </div>
      </section>
    </main>
  );
}

function OrderRow({ node, index, onDelete }: { node: ItemNode; index: number; onDelete?: () => void }) {
  const sequence = itemSequence(node);
  const effectiveItem = activeItem(node);
  const concludedIndex = sequence.findIndex((choice) => choice.status === "Concluded");

  return (
    <div className={`order-item ${node.status === "Non Available" ? "unavailable" : ""}`}>
      <div className="item-main"><span className="item-index">{String(index).padStart(2, "0")}</span><div className="item-name"><strong>{node.product.name}</strong>{sequence.length > 1 && <small>{sequence.length - 1} alternative{sequence.length > 2 ? "s" : ""}</small>}</div>{onDelete && <button className="delete-item" onClick={onDelete} aria-label={`Delete ${node.product.name}`} title="Delete order item"><Icon name="trash" /></button>}</div>
      <div className="fallback-route"><span>Fallback sequence</span><div className="fallback-steps">{sequence.map((choice, choiceIndex) => { const isCurrent = effectiveItem?.id === choice.id; const isConcluded = choice.status === "Concluded"; const isAfterPickup = concludedIndex >= 0 && choiceIndex > concludedIndex; const isUnavailable = choice.status === "Non Available" && !isAfterPickup; return <div className={`fallback-step-wrap ${isAfterPickup ? "after-pickup" : ""}`} key={choice.id}>{choiceIndex > 0 && <Icon name="arrow" />}<span className={`fallback-step ${isUnavailable ? "step-unavailable" : ""} ${isCurrent ? "step-current" : ""} ${isConcluded ? "step-concluded" : ""} ${isAfterPickup ? "step-not-needed" : ""}`}><small>{choiceIndex === 0 ? "Primary" : `Plan ${String.fromCharCode(65 + choiceIndex)}`}</small><strong>{choice.product.name}</strong>{isConcluded ? <em><Icon name="check" />Picked up</em> : isUnavailable ? <em className="unavailable-label"><Icon name="x" />Not available</em> : isAfterPickup ? <em className="not-needed-label">Not needed</em> : isCurrent && <em>Current choice</em>}</span></div>; })}</div></div>
    </div>
  );
}
