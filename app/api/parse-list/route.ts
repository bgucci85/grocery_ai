import { NextRequest, NextResponse } from "next/server";
import { parseGroceryList } from "@/lib/utils/list-parser";
import { CartItem } from "@/lib/runner";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { barboraText, rimiText } = body;

    const items: CartItem[] = [];

    // Parse Barbora items
    if (barboraText && barboraText.trim()) {
      console.log("[parse-list] Parsing Barbora items...");
      const parsed = await parseGroceryList(barboraText);
      console.log(`[parse-list] Barbora parsed:`, JSON.stringify(parsed, null, 2));
      
      for (const item of parsed) {
        const cartItem: CartItem = {
          site: "barbora",
          alternatives: item.alternatives,
          qty: item.quantity,
        };
        console.log(`[parse-list] Adding Barbora item with qty=${item.quantity}:`, item.description);
        items.push(cartItem);
      }
    }

    // Parse Rimi items
    if (rimiText && rimiText.trim()) {
      console.log("[parse-list] Parsing Rimi items...");
      const parsed = await parseGroceryList(rimiText);
      console.log(`[parse-list] Rimi parsed:`, JSON.stringify(parsed, null, 2));
      
      for (const item of parsed) {
        const cartItem: CartItem = {
          site: "rimi",
          alternatives: item.alternatives,
          qty: item.quantity,
        };
        console.log(`[parse-list] Adding Rimi item with qty=${item.quantity}:`, item.description);
        items.push(cartItem);
      }
    }

    console.log(`[parse-list] Returning ${items.length} total items`);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Parse error:", error);
    return NextResponse.json(
      { error: `Failed to parse list: ${error}` },
      { status: 500 }
    );
  }
}

