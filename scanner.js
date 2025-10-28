// scanner.js

(async () => {
  const WPOL = "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270".toLowerCase();
  const TOKEN_SYMBOL = Object.fromEntries(
    Object.entries(window.TOKENS).map(([k, v]) => [k.toLowerCase(), v])
  );

  const ROUTER_ADDR = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff"; // QuickSwap V2
  const ROUTER_ABI = [
    "function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory amounts)"
  ];

  const EXECUTOR_ADDR = "0xBf20dF9e868e72970fDA900530A19F07B0685148";
  const EXECUTOR_ABI = [
    "function executeArbitrage(address[] calldata path, uint256 amountIn, uint256 minAmountOut) external"
  ];

  // DOM elements
  const scan3Btn = document.getElementById('scan3');
  const scan4Btn = document.getElementById('scan4');
  const clearBtn = document.getElementById('clear');
  const statusEl = document.getElementById('status');
  const tbl = document.getElementById('tbl');
  const tb = document.getElementById('tb');
  const bestRouteEl = document.getElementById('best-route');

  function setStatus(text) { statusEl.textContent = text; }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function formatRoute(path) {
    return path.map(a => TOKEN_SYMBOL[a] || 'UNK').join(' → ');
  }

  // Fungsi untuk eksekusi arbitrase
  async function handleExecute(path, amountInWei, minAmountOut) {
    if (!window.ethereum) {
      alert("MetaMask atau wallet lain diperlukan.");
      return;
    }
    try {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const executor = new ethers.Contract(EXECUTOR_ADDR, EXECUTOR_ABI, signer);

      const tx = await executor.executeArbitrage(path, amountInWei, minAmountOut);
      setStatus(`Menunggu konfirmasi: ${tx.hash}`);
      await tx.wait();
      alert("Arbitrase berhasil dieksekusi!");
      setStatus("Selesai — transaksi dikonfirmasi");
    } catch (err) {
      console.error(err);
      alert("Gagal mengeksekusi: " + (err.reason || err.message));
      setStatus("Error saat eksekusi");
    }
  }

  // Fungsi utama pemindaian
  async function runScan(hopCount) {
    const rpc = document.getElementById('rpc').value.trim().replace(/\s+$/, '');
    const amountStr = document.getElementById('amount').value.trim() || "1";
    const delayMs = parseInt(document.getElementById('delay').value || "200", 10);
    const onlyProfit = document.getElementById('filterProfitable').value === 'true';

    if (!rpc) return alert("RPC URL tidak boleh kosong.");
    let amountInWei;
    try { amountInWei = ethers.utils.parseUnits(amountStr, 18); }
    catch { return alert("Jumlah WPOL tidak valid."); }

    let provider;
    try {
      provider = new ethers.providers.JsonRpcProvider(rpc);
      await provider.getBlockNumber();
    } catch {
      setStatus("Error: RPC gagal terhubung");
      return alert("RPC gagal dihubungi.");
    }

    const router = new ethers.Contract(ROUTER_ADDR, ROUTER_ABI, provider);
    const intermediates = Object.keys(window.TOKENS)
      .map(k => k.toLowerCase())
      .filter(a => a !== WPOL);

    const routes = [];

    if (hopCount === 3) {
      // 3-hop: WPOL -> A -> B -> WPOL
      for (let i = 0; i < intermediates.length; i++) {
        for (let j = 0; j < intermediates.length; j++) {
          if (i === j) continue;
          routes.push([WPOL, intermediates[i], intermediates[j], WPOL]);
        }
      }
    } else if (hopCount === 4) {
      // 4-hop: WPOL -> A -> B -> C -> WPOL
      for (let i = 0; i < intermediates.length; i++) {
        for (let j = 0; j < intermediates.length; j++) {
          for (let k = 0; k < intermediates.length; k++) {
            if (i === j || j === k || i === k) continue;
            routes.push([WPOL, intermediates[i], intermediates[j], intermediates[k], WPOL]);
          }
        }
      }
    }

    tb.innerHTML = '';
    tbl.style.display = 'table';
    bestRouteEl.innerHTML = '';
    setStatus(`Memindai ${routes.length} rute (${hopCount}-hop)...`);

    let bestProfit = -Infinity;
    let bestRouteData = null;
    let displayedCount = 0;

    for (let idx = 0; idx < routes.length; idx++) {
      const path = routes[idx];
      setStatus(`(${hopCount}-hop) Memindai ${idx + 1}/${routes.length}`);

      try {
        const amounts = await router.getAmountsOut(amountInWei, path);
        const finalOut = amounts[amounts.length - 1];
        const outHuman = parseFloat(ethers.utils.formatUnits(finalOut, 18));
        const inHuman = parseFloat(amountStr);
        const profit = outHuman - inHuman;
        const profitPct = (profit / inHuman) * 100;

        if (onlyProfit && profitPct <= 0) continue;

        const routeName = formatRoute(path);
        if (profit > bestProfit) {
          bestProfit = profit;
          bestRouteData = { routeName, outHuman, profit, profitPct, path, finalOut };
        }

        const tr = document.createElement('tr');
        const profitClass = profit > 0 ? 'profit-pos' : profit < 0 ? 'profit-neg' : '';
        let noteCell = '–';
        if (profit > 0) {
          const minOut = finalOut.mul(99).div(100); // 1% slippage
          const btn = document.createElement('button');
          btn.textContent = 'Eksekusi';
          btn.className = 'exec-btn';
          btn.onclick = () => handleExecute(path, amountInWei, minOut);
          noteCell = btn.outerHTML;
        }

        tr.innerHTML = `
          <td>${++displayedCount}</td>
          <td><span class="route-path">${routeName}</span></td>
          <td>${outHuman.toFixed(8)}</td>
          <td class="${profitClass}">${profit.toFixed(8)}</td>
          <td class="${profitClass}">${profitPct.toFixed(4)}%</td>
          <td>${noteCell}</td>
        `;
        tb.appendChild(tr);
      } catch {}
      await sleep(delayMs);
    }

    if (bestRouteData && bestRouteData.profit > 0) {
      const minOut = bestRouteData.finalOut.mul(99).div(100);
      const execBtn = document.createElement('button');
      execBtn.textContent = 'Eksekusi Rute Ini';
      execBtn.onclick = () => handleExecute(bestRouteData.path, amountInWei, minOut);

      bestRouteEl.innerHTML = `
        <div style="margin-top:16px; padding:12px; background:#0b253a; border-radius:8px; border-left:3px solid #8de57d">
          <strong>Rute Terbaik (${hopCount}-hop):</strong><br>
          ${bestRouteData.routeName}<br>
          Profit: <span class="profit-pos">${bestRouteData.profit.toFixed(8)} WPOL (${bestRouteData.profitPct.toFixed(4)}%)</span>
        </div>
      `;
      bestRouteEl.querySelector('div').appendChild(execBtn);
    } else {
      bestRouteEl.innerHTML = `<p class="muted">Tidak ada rute profitable (${hopCount}-hop).</p>`;
    }

    setStatus("Selesai");
  }

  // Tombol pemicu
  scan3Btn.addEventListener('click', () => runScan(3));
  scan4Btn.addEventListener('click', () => runScan(4));

  clearBtn.addEventListener('click', () => {
    tb.innerHTML = '';
    bestRouteEl.innerHTML = '';
    tbl.style.display = 'none';
    setStatus('Dibersihkan');
  });
})();

// --- Tambahkan koneksi wallet sederhana ---
const connectBtn = document.getElementById('connectWallet');
const walletInfo = document.getElementById('wallet-info');
connectBtn.addEventListener('click', async () => {
  if (!window.ethereum) {
    alert('MetaMask tidak ditemukan. Silakan instal MetaMask.');
    return;
  }
  try {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    const signer = provider.getSigner();
    const address = await signer.getAddress();
    const network = await provider.getNetwork();
    walletInfo.innerHTML = `✅ Terhubung: <b>${address}</b><br>Jaringan: ${network.name} (${network.chainId})`;
  } catch (err) {
    walletInfo.textContent = '❌ Gagal terhubung ke wallet.';
  }
});
