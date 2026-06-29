let provider, signer, contract;

const CONTRACT_ADDRESS = "0x1e3e97bC7276c54127Ffc38cF03033ECc0Ab8256"; 
const K62_TOKEN_ADDRESS = "0x66B16Abf39433208a7D769078739CEF4742CFF33";
const USDT_ADDRESS = "0x3B66b1E08F55AF26c8eA14a73dA64b6bC8D799dE";    
const TESTNET_CHAIN_ID = 97;

// --- RANK CONFIG (Star1 to Master King) ---
const RANK_DETAILS = [
     { name: "None", count: 0, vol: 0 },
            { name: "Star", count: 10, vol: 1000 },
            { name: "Silver", count: 50, vol: 5000 },
            { name: "Gold", count: 100, vol: 20000 },
            { name: "Platinum", count: 300, vol: 50000 },
            { name: "Diamond", count: 1000, vol: 100000 },
            { name: "D. Diamond", count: 3000, vol: 1500000 },
            { name: "C. Diamond", count: 5000, vol: 2000000 }
];
const CONTRACT_ABI = [
    "function register(address _referrer) external",
    "function activatePhase(uint256 phaseId) external",
    "function buyMatrixLevel(uint256 phaseId, uint256 level) external",
    "function withdrawAllIncome() external",
  "function withdrawStockAmount(uint256 _amount) external",
    "function swapTokenToUSDT(uint256 _tokenAmount) external",
     "function getLevelCost(uint256 phaseId, uint256 level) external view returns (uint256)",
    "function swapUSDTToToken(uint256 _usdtAmount) external",
     "function getTotalAvailableStock(address _user) external view returns (uint256)",
     "function getLiquidityDetails() external view returns (uint256 totalTokens, uint256 totalLiquidity, uint256 liveRate)",
    "function getUserTree(address _user) external view returns (address left, address right)",
    "function getIncomeHistory(address _user) external view returns (tuple(uint256 amount, uint256 timestamp, string incomeType, address fromUser, uint256 phaseId)[])",
    "function users(address) view returns (address referrer, address parent, address left, address right, uint256 directCount, uint256 paidDirectCount, uint256 directIncome, uint256 levelIncome, uint256 salaryIncome, uint256 totalEarned, uint256 lapsedIncome)",
    "function getUserDetails(address _user) external view returns (address referrer, uint256 directInc, uint256 levelInc, uint256 salaryInc, uint256 totalEarned, uint256 lapsed)",
   "function isUserRegistered(address _user) external view returns (bool)"
];
const ERC20_ABI = ["function approve(address spender, uint256 amount) public returns (bool)", "function allowance(address owner, address spender) public view returns (uint256)"];

const calculateGlobalROI = () => 0.90;

// --- 1. AUTO-FILL LOGIC ---
async function checkReferralURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get('ref'); 
    const refField = document.getElementById('reg-referrer');
    
    if (refParam && refField) {
        if (ethers.utils.isAddress(refParam)) {
            refField.value = refParam.trim();
        } else {
            try {
                const address = await contract.usernameToAddress(refParam);
                refField.value = address;
            } catch (e) {
                console.log("Username not found, using as is:", refParam);
                refField.value = refParam.trim();
            }
        }
        console.log("Referral processed:", refField.value);
    }
}

async function getWalletProvider() {
    // Edge में MetaMask या अन्य वॉलेट को प्रायोरिटी देने के लिए
    if (window.ethereum) {
        if (window.ethereum.providers) {
            return window.ethereum.providers.find((p) => p.isMetaMask) || window.ethereum;
        }
        return window.ethereum;
    }
    return null;
}

async function init() {
    checkReferralURL();

    try {
        const ethereumProvider = await getWalletProvider();
        if (!ethereumProvider) {
            console.error("No wallet detected");
            return;
        }

        provider = new ethers.providers.Web3Provider(ethereumProvider, "any");
        
        // --- AUTO NETWORK SWITCH LOGIC ---
        const network = await provider.getNetwork();
        if (network.chainId !== TESTNET_CHAIN_ID) {
            try {
                await ethereumProvider.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x61' }], // 97 = 0x61
                });
                window.location.reload();
                return; 
            } catch (switchError) {
                console.warn("User denied network switch or network not added.");
            }
        }

        // Read-only contract instance
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        window.contract = contract;

        const accounts = await ethereumProvider.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
            signer = provider.getSigner();
            window.signer = signer;
            
            // Signer के साथ contract instance
            contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
            window.contract = contract; 
            
            await setupApp(accounts[0]);
        }

        // --- LIVE RATE AUTO-UPDATE (ADDED) ---
        if (typeof window.updateLiveRate === 'function') {
            window.updateLiveRate(); // पहली बार तुरंत कॉल करें
            setInterval(window.updateLiveRate, 10000); // हर 10 सेकंड में अपडेट करें
        }

        // Listeners (ethereumProvider का उपयोग करें window.ethereum के बजाय)
        ethereumProvider.on('chainChanged', () => window.location.reload());
        ethereumProvider.on('accountsChanged', (accs) => {
            if (accs.length === 0) localStorage.removeItem('userAddress');
            else localStorage.setItem('userAddress', accs[0]);
            window.location.reload();
        });

    } catch (error) {
        console.error("Init Error:", error);
    }
}

window.handleActivatePhase = async function(phaseId) {
    try {
        const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);
        // 3 USDT Approve
        await (await usdt.approve(CONTRACT_ADDRESS, ethers.utils.parseEther("3"))).wait();
        const tx = await contract.activatePhase(phaseId);
        await tx.wait();
        alert("Phase Activated!");
    } catch (err) { alert(err.message); }
};
window.handleBuyLevel = async function(phaseId, level, costInEther) {
    try {
        const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        
        const costPerLevel = ethers.utils.parseEther(costInEther.toString());
        const payment = costPerLevel.mul(2); // 2x Payment

        const userAddress = await signer.getAddress();
        const allowance = await usdt.allowance(userAddress, CONTRACT_ADDRESS);
        
        // अगर अलाउंस कम है, तो अप्रूवल कॉल ट्रिगर करें
        if (allowance.lt(payment)) {
            console.log("Requesting Approval...");
            // gasLimit को बढ़ाकर सेट करें ताकि पॉप-अप पक्का आए
            const approveTx = await usdt.approve(CONTRACT_ADDRESS, payment, {
                gasLimit: 100000 
            });
            
            alert("Approve transaction sent. Please wait for confirmation.");
            await approveTx.wait(); // यहाँ पॉप-अप आना चाहिए
            console.log("Approval Confirmed!");
        }

        // लेवल खरीदें
        console.log("Buying Level...");
        const tx = await contract.buyMatrixLevel(phaseId, level, {
            gasLimit: 500000 // कॉम्प्लेक्स फंक्शन के लिए पर्याप्त गैस
        });
        
        await tx.wait();
        alert("Level Purchased Successfully!");
        location.reload();
        
    } catch (err) { 
        console.error(err);
        // अगर यूजर कैंसिल करता है तो उसका एरर
        if (err.code === 4001) {
            alert("Transaction cancelled by user.");
        } else {
            alert("Transaction Failed: " + (err.reason || err.message));
        }
    }
};
// --- K62 TO USDT SWAP ---
window.handleSwapTokenToUSDT = async function(amountStr) {
    if (!amountStr || amountStr <= 0) return alert("Enter valid amount");
    try {
        const amountInWei = ethers.utils.parseEther(amountStr);
        const k62 = new ethers.Contract(K62_TOKEN_ADDRESS, ERC20_ABI, signer);
        
        // 1. Approve contract to spend K62
        alert("Approving K62 tokens...");
        await (await k62.approve(CONTRACT_ADDRESS, amountInWei)).wait();
        
        // 2. Swap
        alert("Swapping...");
        await (await contract.swapTokenToUSDT(amountInWei)).wait();
        
        alert("Swap Successful!");
        location.reload();
    } catch (err) { alert("Swap Failed: " + (err.reason || err.message)); }
};

// --- USDT TO K62 SWAP ---
window.handleSwapUSDTToToken = async function(amountStr) {
    if (!amountStr || amountStr <= 0) return alert("Enter valid amount");
    try {
        const amountInWei = ethers.utils.parseEther(amountStr);
        const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);
        
        // 1. Approve contract to spend USDT
        alert("Approving USDT...");
        await (await usdt.approve(CONTRACT_ADDRESS, amountInWei)).wait();
        
        // 2. Swap
        alert("Swapping...");
        await (await contract.swapUSDTToToken(amountInWei)).wait();
        
        alert("Swap Successful!");
        location.reload();
    } catch (err) { alert("Swap Failed: " + (err.reason || err.message)); }
};

window.handleWithdraw = async function() {
    const withdrawBtn = event.target;
    try {
        withdrawBtn.disabled = true;
        withdrawBtn.innerText = "WITHDRAWING...";
        
        // कॉन्ट्रैक्ट के withdrawAllIncome फंक्शन में कोई पैरामीटर नहीं है
        const tx = await contract.withdrawAllIncome();
        
        await tx.wait();
        alert("Withdrawal Successful! All income transferred to your wallet.");
        location.reload();
    } catch (err) { 
        console.error("Withdraw Error:", err);
        alert("Withdraw Error: " + (err.reason || err.message)); 
        withdrawBtn.disabled = false;
        withdrawBtn.innerText = "WITHDRAW ALL";
    }
}

window.handleWithdrawStockAmount = async function() {
    const inputAmount = document.getElementById('withdraw-stock-amount').value;
    if (!inputAmount || inputAmount <= 0) return alert("Enter valid amount");

    try {
        // अमाउंट को Wei में कन्वर्ट करना जरूरी है (18 decimals)
        const amountInWei = ethers.utils.parseEther(inputAmount.toString());
        
        const tx = await contract.withdrawStockAmount(amountInWei);
        await tx.wait();
        
        alert("Stock Withdrawn Successfully!");
        location.reload();
    } catch (err) {
        console.error(err);
        alert("Withdraw Error: " + (err.reason || err.message));
    }
}



window.updateStockBalance = async function(address) {
    try {
        const totalStock = await contract.getTotalAvailableStock(address);
        // updateText ग्लोबल फंक्शन है जिसे हमने पहले बनाया था
        updateText('total-stock-display', format(totalStock));
    } catch (err) {
        console.error("Stock Fetch Error:", err);
    }
}




window.handleLogin = async function() {
    try {
        if (!window.ethereum) return alert("Please install Trust Wallet or MetaMask!");
        
        // 1. अकाउंट रिक्वेस्ट करें
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const userAddress = accounts[0];

        // 2. कॉन्ट्रैक्ट से चेक करें कि क्या यूजर रजिस्टर्ड है
        // आपके कॉन्ट्रैक्ट के isUserRegistered फंक्शन का उपयोग
        const isRegistered = await contract.isUserRegistered(userAddress);

        if (isRegistered) {
            localStorage.setItem('userAddress', userAddress);
            window.location.href = "index1.html";
        } else {
            alert("Account not registered! Redirecting to registration page.");
            window.location.href = "register.html";
        }
    } catch (err) { 
        console.error("Login Error:", err); 
        alert("Login failed: " + (err.message || "Unknown error"));
    }
}
window.handleRegister = async function() {
    const refField = document.getElementById('reg-referrer');
    const regBtn = event.target;
    const referrer = refField ? refField.value.trim() : "";

    // 1. वैलिडेशन चेक
    if (!referrer || !ethers.utils.isAddress(referrer)) {
        return alert("Please enter a valid Referrer Address!");
    }

    try {
        regBtn.disabled = true;
        regBtn.innerText = "REGISTERING...";

        // 2. ट्रांजेक्शन ट्रिगर करें
        // gasLimit को ऑटो-एस्टिमेट करने दें या 300,000 रखें जैसा कि आपने सही किया था
        const tx = await contract.register(referrer, { gasLimit: 300000 });
        
        console.log("Transaction Hash:", tx.hash);
        await tx.wait(); // ट्रांजेक्शन कन्फर्म होने का इंतज़ार करें

        // 3. सक्सेस के बाद
        localStorage.setItem('userAddress', await signer.getAddress());
        alert("Registration Successful!");
        window.location.href = "index1.html";

    } catch (err) {
        console.error("Registration Error:", err);
        // कॉन्ट्रैक्ट से आने वाले एरर को दिखाएं
        alert("Registration Failed: " + (err.reason || err.data?.message || err.message));
        
        regBtn.disabled = false;
        regBtn.innerText = "REGISTER"; // बटन वापस ओरिजिनल टेक्स्ट पर लाएं
    }
}

window.handleLogout = function() {
    if (confirm("Disconnect and Logout?")) { localStorage.clear(); window.location.href = "index.html"; }
}

function showLogoutIcon(address) {
    const btn = document.getElementById('connect-btn');
    const logout = document.getElementById('logout-icon-btn');
    if (btn) btn.innerText = address.substring(0, 6) + "..." + address.substring(38);
    if (logout) logout.style.display = 'flex'; 
}

async function setupApp(address) {
    if (!address) return;
    localStorage.setItem('userAddress', address);

    // 1. नेटवर्क चेक और ऑटो-स्विचिंग
    try {
        const network = await provider.getNetwork();
        if (network.chainId !== TESTNET_CHAIN_ID) {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x61' }], // 97 = 0x61
                });
                window.location.reload(); 
                return;
            } catch (switchError) {
                if (switchError.code === 4902) {
                    alert("Please add BSC Testnet to your wallet.");
                } else {
                    alert("Please switch to BSC Testnet manually.");
                }
            }
        }
    } catch (err) {
        console.error("Network check failed:", err);
    }

    // 2. कॉन्ट्रैक्ट डेटा और रिडायरेक्शन लॉजिक (Updated for isUserRegistered)
    try {
        const isRegistered = await contract.isUserRegistered(address);
        const path = window.location.pathname;

        console.log("Is User Registered:", isRegistered);

        // अगर रजिस्टर्ड नहीं है और 'register.html' पर नहीं है, तो भेजें
        if (!isRegistered && !path.includes('register.html')) {
            window.location.href = "register.html";
            return;
        } 
        // अगर रजिस्टर्ड है और 'register.html' पर है, तो डैशबोर्ड भेजें
        else if (isRegistered && path.includes('register.html')) {
            window.location.href = "index1.html";
            return;
        }

        // 3. UI अपडेट करें
        updateNavbar(address);
        showLogoutIcon(address);
        
        // 4. अगर डैशबोर्ड पेज पर है, तो डेटा लोड करें
        if (path.includes('index1.html')) {
            await window.fetchAllData(address);
        }
    } catch (err) {
        console.error("Setup App Logic Error:", err);
    }
}
window.fetchBlockchainHistory = async function(categories) {
    try {
        const address = await window.signer.getAddress();
        const finalLogs = [];

        // 1. STAKE DATA (Name check: 'DEPOSIT' हटाकर 'STAKE' किया)
        if (categories.includes('STAKE')) { 
            const count = await window.contract.getStakeCount(address);
            console.log("Total Stakes found:", count.toString());

            for (let i = 0; i < count; i++) {
                const s = await window.contract.getStake(address, i);
                
                // डेटा मैपिंग - कॉन्ट्रैक्ट के अनुसार
                const amount = s.amount !== undefined ? s.amount : s[0];
                const startTime = s.startTime !== undefined ? s.startTime : s[1];
                const withBurn = s.withBurn !== undefined ? s.withBurn : s[4];

                if (amount) {
                    finalLogs.push({
                        type: 'STAKE', // UI में भी 'STAKE' दिखेगा
                        amount: parseFloat(ethers.utils.formatUnits(amount.toString(), 18)).toFixed(2),
                        date: new Date(startTime * 1000).toLocaleDateString(),
                        time: new Date(startTime * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
                        detail: withBurn ? "With Burn" : "Standard"
                    });
                }
            }
        }

        // 2. INCOME DATA (नाम चेक)
        const incomeLogs = await window.contract.getIncomeHistory(address);
        if (incomeLogs && incomeLogs.length > 0) {
            incomeLogs.forEach(item => {
                const incomeType = item.incomeType || item[0];
                const amount = item.amount || item[1];
                const timestamp = item.timestamp || item[2];

                if (categories.includes(incomeType.toUpperCase())) {
                    finalLogs.push({
                        type: incomeType.toUpperCase(),
                        amount: parseFloat(ethers.utils.formatUnits(amount.toString(), 18)).toFixed(2),
                        date: new Date(timestamp * 1000).toLocaleDateString(),
                        time: new Date(timestamp * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
                        detail: incomeType
                    });
                }
            });
        }

        return finalLogs;
    } catch (e) {
        console.error("DEBUG: History Error Trace:", e);
        return [];
    }
}

// कीमतों को JS में ही स्टोर करें (ताकि कॉन्ट्रैक्ट को बार-बार कॉल न करना पड़े)
const STATIC_PHASE_COSTS = {
    1: [0, "2", "4", "8", "16", "32"],
    2: [0, "10", "20", "40", "80", "160"],
    3: [0, "50", "100", "200", "400", "800"],
    4: [0, "200", "400", "800", "1600", "3200"],
    5: [0, "500", "1000", "2000", "4000", "8000"],
    6: [0, "2000", "4000", "8000", "16000", "32000"]
};

window.renderLevels = async function(phaseId) {
    const container = document.getElementById('levels-container');
    if (!container) return;
    
    // तुरंत रेंडर करें, लोडिंग टेक्स्ट की जरूरत नहीं
    try {
        let html = "";
        const costs = STATIC_PHASE_COSTS[phaseId];
        
        if (!costs) throw new Error("Invalid Phase ID");

        for(let level = 1; level <= 5; level++) {
            const costInUsdt = costs[level]; // सीधे एरे से कीमत उठाएं
            
            html += `
                <div class="bg-black/50 p-4 rounded-xl border border-white/10 text-center">
                    <p class="text-[9px] label-text mb-1">LEVEL ${level}</p>
                    <h4 class="text-sm font-bold mb-3 text-white">${costInUsdt} USDT</h4>
                    <button onclick="handleBuyLevel(${phaseId}, ${level}, '${costInUsdt}')" 
                            class="btn-gold-pro w-full py-2 rounded-lg text-[10px] uppercase font-bold">
                        BUY
                    </button>
                </div>
            `;
        }
        container.innerHTML = html;
    } catch (err) {
        console.error("Error loading levels:", err);
        container.innerHTML = `<p class="text-xs text-red-500">Failed to load levels.</p>`;
    }
};
// पेज लोड होते ही तुरंत रेंडर करें (बिना किसी देरी के)
window.addEventListener('DOMContentLoaded', () => {
    if(typeof window.renderLevels === 'function') {
        window.renderLevels(1); 
    }
});
// यह फंक्शन कॉल करें जब डेटा लोड हो
window.updateLiveRate = async function() {
    const data = await contract.getLiquidityDetails(); // आपके कॉन्ट्रैक्ट का फंक्शन
    const liveRate = ethers.utils.formatEther(data.liveRate);
    document.getElementById('live-rate-display').innerText = parseFloat(liveRate).toFixed(4);
};
window.fetchAllData = async function(address) {
    try {
        console.log("Syncing all data for:", address);

        // 1. Referral URL Setup
        const refUrl = `${window.location.origin}/register.html?ref=${address}`; 
        const refInput = document.getElementById('refURL');
        if(refInput) refInput.value = refUrl;
        
        // 2. Address display fix
        const addrDisplay = document.getElementById('user-address');
        if(addrDisplay) addrDisplay.innerText = address;

        // 3. Contract Data Calls
        const userData = await contract.users(address);
        const details = await contract.getUserDetails(address);
        const liq = await contract.getLiquidityDetails();

        // --- UI UPDATES ---
        
        // Structure & Network Data
        updateText('referrer-address', userData.referrer);
        updateText('parent-address', userData.parent);
        updateText('left-child', userData.left);
        updateText('right-child', userData.right);
        
        // Counts
        updateText('direct-count', userData.directCount.toString());
        updateText('paid-direct-count', userData.paidDirectCount.toString());
        
        // Income Details
        updateText('direct-income', format(userData.directIncome));
        updateText('level-income', format(userData.levelIncome));
        updateText('salary-income', format(userData.salaryIncome));
        updateText('total-earned', format(userData.totalEarned));
        updateText('lapsed-income', format(userData.lapsedIncome));
        
        // Market Info
        updateText('live-rate', format(liq.liveRate));

        // 4. Stock Balance Update (Call to the window function)
        await window.updateStockBalance(address); 

        console.log("Dashboard sync complete!");

    } catch (err) { 
        console.error("Fetch Data Error:", err); 
    }
};

// Ensure ki 'format' function ethers.utils ka use kar raha ho
const format = (val) => val ? parseFloat(ethers.utils.formatUnits(val, 18)).toFixed(2) : "0.00";
const updateText = (id, val) => document.querySelectorAll(`[id="${id}"]`).forEach(el => el.innerText = val);
function updateNavbar(addr) { const btn = document.getElementById('connect-btn'); if(btn) btn.innerText = addr.substring(0,6) + "..." + addr.substring(38); }

window.addEventListener('load', init);
