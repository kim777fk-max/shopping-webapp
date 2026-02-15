// Supabase Edge Function: shopping
// Route prefix: /functions/v1/shopping
//
// Endpoints:
// - GET  /day?date=YYYY-MM-DD
// - POST /shop                 { date, name }
// - POST /item                 { shop_id, name, planned_price }
// - POST /item/:id/toggle      { is_bought }
// - POST /item/:id/actual      { actual_price }
//
// Auth:
// - verify_jwt=false (see config.toml)
// - Requires Authorization: Bearer <SHOPPING_TOKEN>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type Json = Record<string, unknown>;

const corsHeaders: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "authorization,content-type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

function bad(message: string, status = 400): Response {
  return json({ ok: false, error: message }, status);
}

function getBearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function requireToken(req: Request): Response | null {
  const expected = Deno.env.get("SHOPPING_TOKEN");
  if (!expected) {
    // If not set, allow (dev). In prod, set SHOPPING_TOKEN.
    return null;
  }
  const got = getBearer(req);
  if (!got) return bad("missing bearer token", 401);
  if (got !== expected) return bad("invalid token", 403);
  return null;
}

function supabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function pathAfterFunction(req: Request): string {
  // /functions/v1/shopping/<rest>
  const u = new URL(req.url);
  const parts = u.pathname.split("/").filter(Boolean);
  const i = parts.indexOf("shopping");
  const rest = i >= 0 ? parts.slice(i + 1) : [];
  return "/" + rest.join("/");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const authErr = requireToken(req);
  if (authErr) return authErr;

  const sb = supabaseAdmin();
  const u = new URL(req.url);
  const p = pathAfterFunction(req);

  try {
    if (req.method === "GET" && p === "/day") {
      const d = u.searchParams.get("date") || new Date().toISOString().slice(0, 10);
      const ym = d.slice(0, 7);

      const { data: shops, error: shopsErr } = await sb
        .from("shops")
        .select("id,name")
        .eq("date", d)
        .order("id");
      if (shopsErr) return bad(shopsErr.message, 500);

      const outShops = [] as Json[];
      let dayPlanned = 0;
      let dayActual = 0;

      for (const shop of shops || []) {
        const { data: items, error: itemsErr } = await sb
          .from("items")
          .select("id,name,planned_price,actual_price,is_bought")
          .eq("shop_id", shop.id)
          .order("id");
        if (itemsErr) return bad(itemsErr.message, 500);

        const outItems = (items || []).map((it) => {
          const pp = Number(it.planned_price || 0);
          const ap = Number(it.actual_price || 0);
          dayPlanned += pp;
          if (it.is_bought) dayActual += ap;
          return {
            id: it.id,
            name: it.name,
            planned_price: pp,
            actual_price: ap,
            is_bought: !!it.is_bought,
          };
        });

        outShops.push({ id: shop.id, name: shop.name, items: outItems });
      }

      // month totals: select shops in month, then items join via shop_id
      const { data: monthShops, error: monthShopsErr } = await sb
        .from("shops")
        .select("id")
        .gte("date", `${ym}-01`)
        .lt("date", `${ym}-32`);
      if (monthShopsErr) return bad(monthShopsErr.message, 500);

      const shopIds = (monthShops || []).map((s) => s.id);
      let monthPlanned = 0;
      let monthActual = 0;
      if (shopIds.length) {
        const { data: monthItems, error: monthItemsErr } = await sb
          .from("items")
          .select("planned_price,actual_price,is_bought")
          .in("shop_id", shopIds);
        if (monthItemsErr) return bad(monthItemsErr.message, 500);
        for (const it of monthItems || []) {
          monthPlanned += Number(it.planned_price || 0);
          if (it.is_bought) monthActual += Number(it.actual_price || 0);
        }
      }

      return json({
        date: d,
        shops: outShops,
        totals: {
          day_planned: dayPlanned,
          day_actual: dayActual,
          month_planned: monthPlanned,
          month_actual: monthActual,
        },
      });
    }

    if (req.method === "POST" && p === "/shop") {
      const body = await req.json();
      const d = String(body.date || "");
      const name = String(body.name || "").trim();
      if (!d || !name) return bad("date and name required", 400);

      const { data, error } = await sb.from("shops").insert({ date: d, name }).select("id").single();
      if (error) return bad(error.message, 500);
      return json({ ok: true, id: data.id });
    }

    if (req.method === "POST" && p === "/item") {
      const body = await req.json();
      const shop_id = Number(body.shop_id || 0);
      const name = String(body.name || "").trim();
      const planned_price = Number(body.planned_price || 0);
      if (!shop_id || !name) return bad("shop_id and name required", 400);

      const { data, error } = await sb
        .from("items")
        .insert({ shop_id, name, planned_price, actual_price: planned_price, is_bought: false })
        .select("id")
        .single();
      if (error) return bad(error.message, 500);
      return json({ ok: true, id: data.id });
    }

    const mToggle = p.match(/^\/item\/(\d+)\/toggle$/);
    if (req.method === "POST" && mToggle) {
      const item_id = Number(mToggle[1]);
      const body = await req.json();
      const is_bought = !!body.is_bought;
      const { error } = await sb.from("items").update({ is_bought }).eq("id", item_id);
      if (error) return bad(error.message, 500);
      return json({ ok: true });
    }

    const mActual = p.match(/^\/item\/(\d+)\/actual$/);
    if (req.method === "POST" && mActual) {
      const item_id = Number(mActual[1]);
      const body = await req.json();
      const actual_price = Number(body.actual_price || 0);
      const { error } = await sb.from("items").update({ actual_price }).eq("id", item_id);
      if (error) return bad(error.message, 500);
      return json({ ok: true });
    }

    return bad(`not found: ${req.method} ${p}`, 404);
  } catch (e) {
    return bad(String(e), 500);
  }
});
