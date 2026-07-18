export interface Person {
  name: string;
  order: Order;
}

export interface Order {
  person: Person;
  items: OrderItem[];
}

export interface Product {
  name: string;
}

export interface OrderItem {
  product: Product;
  alternativeOrderItem: OrderItem | null;
  status: "Not Processed" | "Concluded" | "Non Available";
}
