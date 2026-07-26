import { useState } from 'react';
import { X, ArrowRight } from 'lucide-react';
import {
  bridgeUsdcToArc,
  BRIDGE_SOURCE_CHAINS,
  type BridgeStepInfo,
} from './appkit/bridge';

type StatusKind = 'info' | 'success' | 'error';
const AMOUNT_CHIPS = ['1', '5', '10', '25'];

/**
 * Bridge USDC from an EVM testnet into Arc Testnet (Circle Bridge Kit / CCTP).
 * Self-contained: manages its own state and injects its own scoped styles.
 */
export default function BridgePanel({ onClose }: { onClose: () => void }) {
  const [sourceChain, setSourceChain] = useState(BRIDGE_SOURCE_CHAINS[0].id);
  const [amount, setAmount] = useState('1.00');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; kind: StatusKind } | null>(null);
  const [steps, setSteps] = useState<BridgeStepInfo[]>([]);

  const sourceLabel =
    BRIDGE_SOURCE_CHAINS.find((c) => c.id === sourceChain)?.label ?? sourceChain;

  const handleBridge = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setStatus({ text: 'Enter a valid USDC amount.', kind: 'error' });
      return;
    }

    setBusy(true);
    setSteps([]);
    setStatus({ text: `Preparing bridge from ${sourceLabel}…`, kind: 'info' });

    try {
      const result = await bridgeUsdcToArc({
        sourceChain,
        amount,
        onProgress: () => setStatus({ text: 'Bridging — approve the wallet prompts…', kind: 'info' }),
        onSteps: (s) => setSteps(s),
      });

      if (result.state === 'success') {
        setStatus({ text: `Done! ${amount} USDC bridged to Arc Testnet.`, kind: 'success' });
      } else {
        setStatus({ text: `Bridge ended in state "${result.state}". See steps below.`, kind: 'info' });
      }
    } catch (error) {
      setStatus({ text: (error as Error).message ?? 'Bridge failed.', kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal-content bp-modal" onClick={(e) => e.stopPropagation()}>
        <style>{BRIDGE_STYLES}</style>

        <div className="modal-header">
          <h3>Bridge USDC to Arc</h3>
          <button className="close-btn" onClick={() => !busy && onClose()}>
            <X size={20} />
          </button>
        </div>

        <div className="bp-body">
          <div className="bp-route">
            <div className="bp-chain">
              <span className="bp-chain-label">From</span>
              <div className="bp-select-wrap">
                <select
                  className="bp-select"
                  value={sourceChain}
                  disabled={busy}
                  onChange={(e) => setSourceChain(e.target.value)}
                >
                  {BRIDGE_SOURCE_CHAINS.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="bp-arrow"><ArrowRight size={18} /></div>

            <div className="bp-chain">
              <span className="bp-chain-label">To</span>
              <div className="bp-dest">Arc Testnet</div>
            </div>
          </div>

          <div className="bp-amount">
            <input
              className="bp-amount-input"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              disabled={busy}
              placeholder="0.00"
              onChange={(e) => setAmount(e.target.value)}
            />
            <span className="bp-amount-suffix">USDC</span>
          </div>

          <div className="bp-chips">
            {AMOUNT_CHIPS.map((a) => (
              <button key={a} className="bp-chip" disabled={busy} onClick={() => setAmount(a)}>
                {a}
              </button>
            ))}
          </div>

          <p className="bp-note">
            Your wallet must be on <strong>{sourceLabel}</strong> and hold test USDC there.
            Uses Circle CCTP — settlement can take about a minute.
          </p>

          <button className="confirm-btn" disabled={busy} onClick={() => void handleBridge()}>
            {busy ? 'Bridging…' : `Bridge ${amount || '0'} USDC`}
          </button>

          {status && <div className={`bp-status bp-status-${status.kind}`}>{status.text}</div>}

          {steps.length > 0 && (
            <div className="bp-steps">
              {steps.map((step) => (
                <div key={step.name} className="bp-step">
                  <span className="bp-step-name">{step.name}</span>
                  <span className={`bp-pill bp-pill-${step.state}`}>
                    {step.state}
                    {step.explorerUrl ? (
                      <a className="bp-txlink" href={step.explorerUrl} target="_blank" rel="noreferrer">↗</a>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const BRIDGE_STYLES = `
.modal-content.bp-modal { max-width: 440px; }
.bp-body { padding: 22px 20px; display: flex; flex-direction: column; gap: 16px; }
.bp-route { display: flex; align-items: flex-end; gap: 12px; }
.bp-chain { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.bp-chain-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--ft-text-dim); }
.bp-select-wrap { position: relative; }
.bp-select-wrap::after { content: '▾'; position: absolute; right: 14px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--ft-text-dim); font-size: 12px; }
.bp-select { width: 100%; appearance: none; -webkit-appearance: none; background: var(--ft-card-bg); border: 1px solid var(--ft-border); color: var(--ft-text); padding: 13px 34px 13px 14px; border-radius: 12px; font-size: 14px; font-weight: 600; outline: none; cursor: pointer; }
.bp-select:focus { border-color: var(--ft-accent); }
.bp-select option { background: #0b1220; color: var(--ft-text); }
.bp-arrow { padding-bottom: 12px; color: var(--ft-accent); display: flex; }
.bp-dest { display: flex; align-items: center; justify-content: center; padding: 13px 14px; border-radius: 12px; font-size: 14px; font-weight: 700; color: var(--ft-accent); background: rgba(0, 242, 255, 0.08); border: 1px solid rgba(0, 242, 255, 0.3); }
.bp-amount { display: flex; align-items: center; gap: 8px; background: var(--ft-card-bg); border: 1px solid var(--ft-border); border-radius: 14px; padding: 4px 16px; }
.bp-amount:focus-within { border-color: var(--ft-accent); }
.bp-amount-input { flex: 1; background: none; border: none; outline: none; color: var(--ft-text); font-size: 26px; font-weight: 700; padding: 10px 0; width: 100%; min-width: 0; }
.bp-amount-input::-webkit-outer-spin-button, .bp-amount-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.bp-amount-suffix { font-size: 15px; font-weight: 700; color: var(--ft-text-dim); }
.bp-chips { display: flex; gap: 8px; }
.bp-chip { flex: 1; padding: 8px 0; border-radius: 10px; background: var(--ft-glass); border: 1px solid var(--ft-border); color: var(--ft-text-dim); font-weight: 600; font-size: 13px; cursor: pointer; transition: all 0.2s; }
.bp-chip:hover { color: var(--ft-text); border-color: var(--ft-accent); }
.bp-chip:disabled { opacity: 0.5; cursor: not-allowed; }
.bp-note { font-size: 12px; color: var(--ft-text-dim); line-height: 1.5; margin: 0; }
.bp-note strong { color: var(--ft-text); }
.bp-status { font-size: 13px; padding: 10px 12px; border-radius: 10px; line-height: 1.4; }
.bp-status-info { background: var(--ft-glass); color: var(--ft-text); }
.bp-status-success { background: rgba(16, 185, 129, 0.12); color: var(--ft-success); }
.bp-status-error { background: rgba(239, 68, 68, 0.12); color: var(--ft-danger); }
.bp-steps { display: flex; flex-direction: column; gap: 8px; }
.bp-step { display: flex; align-items: center; justify-content: space-between; font-size: 13px; padding: 8px 12px; border-radius: 10px; background: var(--ft-glass); border: 1px solid var(--ft-border); }
.bp-step-name { color: var(--ft-text); text-transform: capitalize; }
.bp-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 3px 8px; border-radius: 999px; color: var(--ft-text-dim); background: rgba(255, 255, 255, 0.06); }
.bp-pill-success { color: var(--ft-success); background: rgba(16, 185, 129, 0.14); }
.bp-pill-error { color: var(--ft-danger); background: rgba(239, 68, 68, 0.14); }
.bp-pill-pending { color: var(--ft-accent); background: rgba(0, 242, 255, 0.12); }
.bp-txlink { color: inherit; text-decoration: none; }
`;
