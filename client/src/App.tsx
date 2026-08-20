/**
 * Vault Tumbler Lab — 真鍮の機械製図室。
 * ルートは全画面のBabylonゲームだけを表示し、外側のUIで機構観察を遮らない。
 */
import ErrorBoundary from "./components/ErrorBoundary";
import GameCanvas from "./components/GameCanvas";

export default function App() {
  return (
    <ErrorBoundary>
      <GameCanvas />
    </ErrorBoundary>
  );
}

