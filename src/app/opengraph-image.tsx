import { ImageResponse } from 'next/og';

export const alt = 'Bright Blue — everyday essentials, made in Kerala';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%', background: '#faf7f2', color: '#0b1f3a', padding: 72, flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', fontSize: 28, letterSpacing: 5 }}>BRIGHT BLUE</div>
      <div style={{ display: 'flex', fontSize: 82, fontWeight: 700, maxWidth: 900, lineHeight: 1.05 }}>Good things for everyday living.</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #0b1f3a', paddingTop: 26, fontSize: 25 }}><span>Home care · Food · Personal care</span><span>Made in Kerala</span></div>
    </div>, size,
  );
}
