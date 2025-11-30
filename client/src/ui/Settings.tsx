import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { setBackendUrl } from '../backend';

interface SettingsProps {
	isOpen: boolean;
	onClose: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ isOpen, onClose }) => {
	const [backendUrl, setBackendUrlState] = useState<string>('');
	const [showConfirm, setShowConfirm] = useState(false);

	useEffect(() => {
		if (isOpen) {
			const savedUrl = localStorage.getItem('backend_url') || 'ws://47.79.92.12:2567';
			setBackendUrlState(savedUrl);
		}
	}, [isOpen]);

	const handleSave = () => {
		if (backendUrl.trim()) {
			setBackendUrl(backendUrl.trim());
		} else {
			// Empty string means use default, so remove from localStorage
			localStorage.removeItem('backend_url');
		}
		setShowConfirm(true);
	};

	const handleReset = () => {
		localStorage.removeItem('backend_url');
		setBackendUrlState('');
		setShowConfirm(true);
	};

	const handleReload = () => {
		window.location.reload();
	};

	if (!isOpen) return null;

	return (
		<div style={{
			position: 'fixed',
			top: 0,
			left: 0,
			width: '100%',
			height: '100%',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			zIndex: 3000,
			background: 'rgba(0, 0, 0, 0.7)',
			pointerEvents: 'auto'
		}} onClick={onClose}>
			<div style={{
				background: 'rgba(20, 20, 30, 0.95)',
				borderRadius: '12px',
				padding: '30px',
				maxWidth: '500px',
				width: '90%',
				border: '2px solid rgba(255, 255, 255, 0.1)',
				boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
			}} onClick={(e) => e.stopPropagation()}>
				<div style={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					marginBottom: '20px'
				}}>
					<h2 style={{
						margin: 0,
						color: '#ffffff',
						fontSize: '24px',
						fontWeight: 'bold'
					}}>
						Settings
					</h2>
					<button
						onClick={onClose}
						style={{
							background: 'transparent',
							border: 'none',
							color: '#ffffff',
							cursor: 'pointer',
							fontSize: '24px',
							padding: '5px 10px',
							borderRadius: '4px',
							transition: 'background 0.2s'
						}}
						onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
						onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
					>
						<Icon icon="mdi:close" width="24" height="24" />
					</button>
				</div>

				{showConfirm ? (
					<div style={{
						padding: '20px',
						background: 'rgba(255, 200, 0, 0.1)',
						borderRadius: '8px',
						border: '1px solid rgba(255, 200, 0, 0.3)',
						marginBottom: '20px'
					}}>
						<p style={{
							margin: '0 0 15px 0',
							color: '#ffc800',
							fontSize: '14px'
						}}>
							Backend URL has been updated. Please reload the page for changes to take effect.
						</p>
						<button
							onClick={handleReload}
							style={{
								width: '100%',
								padding: '10px',
								background: '#ffc800',
								color: '#000000',
								border: 'none',
								borderRadius: '6px',
								fontSize: '16px',
								fontWeight: 'bold',
								cursor: 'pointer',
								transition: 'background 0.2s'
							}}
							onMouseOver={(e) => e.currentTarget.style.background = '#ffd700'}
							onMouseOut={(e) => e.currentTarget.style.background = '#ffc800'}
						>
							Reload Page
						</button>
					</div>
				) : (
					<>
						<div style={{ marginBottom: '20px' }}>
							<label style={{
								display: 'block',
								marginBottom: '8px',
								color: '#cccccc',
								fontSize: '14px',
								fontWeight: '500'
							}}>
								Backend Server URL (WebSocket)
							</label>
							<select
								onChange={(e) => setBackendUrlState(e.target.value)}
								value={backendUrl}
								style={{
									width: '100%',
									padding: '12px',
									marginBottom: '10px',
									background: 'rgba(255, 255, 255, 0.1)',
									border: '1px solid rgba(255, 255, 255, 0.2)',
									borderRadius: '6px',
									color: '#ffffff',
									fontSize: '14px',
									fontFamily: 'monospace',
									boxSizing: 'border-box',
									cursor: 'pointer'
								}}
							>
								<option value="" style={{ color: '#000' }}>Select a preset...</option>
								<option value="ws://47.79.92.12:2567" style={{ color: '#000' }}>Production (ws://47.79.92.12:2567)</option>
								<option value="ws://localhost:2567" style={{ color: '#000' }}>Localhost (ws://localhost:2567)</option>
							</select>
							<input
								type="text"
								value={backendUrl}
								onChange={(e) => setBackendUrlState(e.target.value)}
								placeholder="ws://localhost:2567"
								style={{
									width: '100%',
									padding: '12px',
									background: 'rgba(255, 255, 255, 0.1)',
									border: '1px solid rgba(255, 255, 255, 0.2)',
									borderRadius: '6px',
									color: '#ffffff',
									fontSize: '14px',
									fontFamily: 'monospace',
									boxSizing: 'border-box'
								}}
							/>
							<p style={{
								margin: '8px 0 0 0',
								color: '#888888',
								fontSize: '12px'
							}}>
								Leave empty to use default (auto-detect or localhost:2567)
							</p>
						</div>

						<div style={{
							display: 'flex',
							gap: '10px'
						}}>
							<button
								onClick={handleSave}
								style={{
									flex: 1,
									padding: '12px',
									background: '#4CAF50',
									color: '#ffffff',
									border: 'none',
									borderRadius: '6px',
									fontSize: '16px',
									fontWeight: 'bold',
									cursor: 'pointer',
									transition: 'background 0.2s'
								}}
								onMouseOver={(e) => e.currentTarget.style.background = '#45a049'}
								onMouseOut={(e) => e.currentTarget.style.background = '#4CAF50'}
							>
								Save
							</button>
							<button
								onClick={handleReset}
								style={{
									flex: 1,
									padding: '12px',
									background: 'rgba(255, 255, 255, 0.1)',
									color: '#ffffff',
									border: '1px solid rgba(255, 255, 255, 0.2)',
									borderRadius: '6px',
									fontSize: '16px',
									fontWeight: 'bold',
									cursor: 'pointer',
									transition: 'background 0.2s'
								}}
								onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
								onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
							>
								Reset to Default
							</button>
						</div>
					</>
				)}
			</div>
		</div>
	);
};

