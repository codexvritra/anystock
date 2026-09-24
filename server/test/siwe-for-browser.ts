// Dev helper: print a signed SIWE payload for a throwaway key, to sign in a browser that has no wallet.
//   npx tsx test/siwe-for-browser.ts   then in the page:  fetch("/api/v1/auth/verify", {method:"POST", headers:{"content-type":"application/json"}, body: <output>})
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";

const acct = privateKeyToAccount(generatePrivateKey());
const { nonce, chainId, domain } = await (await fetch("http://localhost:8787/api/v1/auth/nonce")).json();
const message = createSiweMessage({
  address: acct.address,
  chainId,
  domain,
  nonce,
  uri: `http://${domain}`,
  version: "1",
  statement: "Sign in to Streetstock. This costs nothing and moves nothing.",
});
console.log(JSON.stringify({ message, signature: await acct.signMessage({ message }) }));
