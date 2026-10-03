/**
 * Gate 16 scenario: one self-planning settlement on Landmass at the large size, where distances are
 * longest, with carts on. No build calls and no scripted knowledge: the Cart Shed must be thought of.
 * Long hauls (at least `cart_min_tiles`) are counted by the good, on foot and by cart.
 */
import { start, worldOf, type Scenario } from '../../../src/gates/kit.ts';
import { runFor, villagers } from '../../../src/sim/index.ts';

export const run: Scenario = (content, params) => {
  const { seed, seconds } = params;
  const S = start(content, seed, { planner: true, carts: true, ...worldOf(params) });
  runFor(S, seconds);
  const st = S.stats, r = (v: number) => Math.round(v * 1000) / 1000;
  const footGoods = st.longGoods - st.longGoodsByCart;
  const foot = st.longFootSeconds / Math.max(1, footGoods), cart = st.longCartSeconds / Math.max(1, st.longGoodsByCart);
  const known = S.chronicle.find(c => c.kind === 'invented' && c.text.includes(content.blueprints.cart_shed.name));
  return {
    state: S,
    metrics: {
      game_seconds: Math.round(S.t),
      villagers: villagers(S).length,
      carts_known: known ? 1 : 0,
      carts_known_at: known ? Math.round(known.t) : -1,
      cart_sheds: S.buildings.filter(b => b.type === 'cart_shed' && !b.site).length,
      long_goods: st.longGoods,
      long_cart_share: r(st.longGoodsByCart / Math.max(1, st.longGoods)),
      seconds_per_good_on_foot: r(foot),
      seconds_per_good_by_cart: r(cart),
      cart_time_ratio: r(st.longGoodsByCart ? cart / Math.max(1e-6, foot) : 1),
      mean_delivery_seconds: r(st.deliverySeconds / Math.max(1, st.delivered)),
    },
  };
};
