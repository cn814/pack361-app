import { test } from "node:test";
import assert from "node:assert/strict";
import {
  byStore,
  formatAmount,
  formatPacks,
  itemKey,
  mergeCounts,
  portions,
  scaleFactor,
  scaledAmount,
  shoppingList,
  totalPeople,
  type Ingredient,
  type MenuItem,
} from "./kitchen";

const ing = (name: string, amount: number | null, unit: string | null, more: Partial<Ingredient> = {}): Ingredient => ({
  name,
  amount,
  unit,
  share: 1,
  pack_size: null,
  pack_unit: null,
  store: null,
  note: null,
  ...more,
});

test("a cook's own count replaces the RSVPs for that group only", () => {
  assert.deepEqual(mergeCounts({ adult: 20, bear: 4, sib: 2 }, { adult: 25, sib: 0 }), { adult: 25, bear: 4 });
  assert.equal(totalPeople({ adult: 25, bear: 4 }), 29);
});

test("portions weigh each group by appetite", () => {
  // 10 adults, 4 Lions at ½, 2 Bears at 0.7, 1 toddler with no weight set (counts as 1).
  assert.equal(portions({ adult: 10, lion: 4, bear: 2, sib_0_3: 1 }, { adult: 1, lion: 0.5, bear: 0.7 }), 10 + 2 + 1.4 + 1);
  assert.equal(portions({}, {}), 0);
});

test("scaling a recipe", () => {
  assert.equal(scaleFactor(8, 40), 5);
  assert.equal(scaleFactor(60, 30, 0.5), 0.25, "a meal half the group eats");
  assert.equal(scaleFactor(0, 30), 0);
  assert.equal(scaledAmount({ amount: 2, share: 0.75 }, 4), 6);
  assert.equal(scaledAmount({ amount: null, share: 1 }, 4), null);
});

test("the shopping list adds the same item up across recipes and rounds up to packages", () => {
  const menu: MenuItem[] = [
    {
      meal_label: "Saturday breakfast",
      people_share: 1,
      recipe: {
        id: "a",
        title: "Pancakes",
        servings: 10,
        ingredients: [ing("Eggs", 10, "eggs", { pack_size: 12, pack_unit: "dozen" }), ing("Salt", null, null)],
      },
    },
    {
      meal_label: "Saturday dessert",
      people_share: 1,
      recipe: {
        id: "b",
        title: "Brownies",
        servings: 20,
        ingredients: [ing(" eggs ", 4, "Eggs", { pack_size: 12, pack_unit: "dozen", store: "Costco", note: "Large" })],
      },
    },
  ];
  const list = shoppingList(menu, 30);
  const eggs = list.find((l) => l.name === "Eggs")!;
  assert.equal(eggs.need, 30 + 6);
  assert.equal(eggs.packs, 3);
  assert.equal(eggs.store, "Costco");
  assert.deepEqual(eggs.uses, ["Pancakes", "Brownies"]);
  assert.deepEqual(eggs.notes, ["Large"]);
  assert.equal(formatPacks(eggs), "3 × dozen");
  const salt = list.find((l) => l.name === "Salt")!;
  assert.equal(salt.need, null);
  assert.equal(salt.packs, null);
  assert.equal(list.length, 2);
});

test("exactly a package's worth is one package, not two", () => {
  const menu: MenuItem[] = [
    { meal_label: "x", people_share: 1, recipe: { id: "a", title: "A", servings: 3, ingredients: [ing("Milk", 0.1, "gal", { pack_size: 0.3, pack_unit: "jug" })] } },
  ];
  assert.equal(shoppingList(menu, 9)[0].packs, 1);
});

test("the list by store, Anywhere last", () => {
  const lines = shoppingList(
    [
      {
        meal_label: "x",
        people_share: 1,
        recipe: {
          id: "a",
          title: "A",
          servings: 1,
          ingredients: [ing("Bread", 1, "loaf"), ing("Hot dogs", 1, null, { store: "Walmart" }), ing("Cheese", 1, "lb", { store: "Costco" })],
        },
      },
    ],
    1,
  );
  assert.deepEqual(
    byStore(lines).map((g) => g.store),
    ["Costco", "Walmart", "Anywhere"],
  );
});

test("item keys ignore case and spacing", () => {
  assert.equal(itemKey(" Eggs", "EGGS", 12, "Dozen "), itemKey("eggs", "eggs", 12, "dozen"));
  assert.notEqual(itemKey("Eggs", "eggs", 12, "dozen"), itemKey("Eggs", "eggs", 18, "dozen"));
});

test("amounts for people to read", () => {
  assert.equal(formatAmount(36), "36");
  assert.equal(formatAmount(10.2), "11");
  assert.equal(formatAmount(2), "2");
  assert.equal(formatAmount(2.5), "2 ½");
  assert.equal(formatAmount(0.3), "⅓");
  assert.equal(formatAmount(0.7), "¾");
  assert.equal(formatAmount(1.9), "2");
  assert.equal(formatAmount(0.03), "a pinch");
  assert.equal(formatAmount(null), "");
  assert.equal(formatAmount(0), "0");
});
