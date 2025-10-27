// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IUniswapV2Router02 {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
    function approve(address spender, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract QuickArbExecutor {
    address public constant QUICKSWAP_ROUTER = 0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff;
    address public constant WPOL = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;
    address public immutable owner;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    /// @notice Eksekusi arbitrase multi-hop di QuickSwap V2
    /// @param path Rute token (harus mulai & akhiri dengan WPOL)
    /// @param amountIn Jumlah WPOL yang di-swap (dalam wei, 18 desimal)
    /// @param minAmountOut Jumlah minimum WPOL yang diharapkan kembali
    function executeArbitrage(
        address[] calldata path,
        uint256 amountIn,
        uint256 minAmountOut
    ) external onlyOwner {
        require(path.length >= 3, "Path too short");
        require(path[0] == WPOL, "Start must be WPOL");
        require(path[path.length - 1] == WPOL, "End must be WPOL");

        // Tarik WPOL dari pemilik
        IERC20(WPOL).transferFrom(msg.sender, address(this), amountIn);
        // Approve ke router
        IERC20(WPOL).approve(QUICKSWAP_ROUTER, amountIn);

        // Lakukan swap
        IUniswapV2Router02(QUICKSWAP_ROUTER).swapExactTokensForTokens(
            amountIn,
            minAmountOut,
            path,
            address(this),
            block.timestamp + 60 // 60 detik deadline
        );

        // Kirim semua WPOL hasil kembali ke pemilik
        uint256 finalBalance = IERC20(WPOL).balanceOf(address(this));
        IERC20(WPOL).transfer(msg.sender, finalBalance);
    }

    /// @notice Tarik token apa pun jika tersangkut (misal USDC, WETH, dll)
    function rescueToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner, amount);
    }
}
