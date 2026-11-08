import type Phaser from 'phaser';

/** Impulsion au sol : le point reste lisible même quand les fronts sortent de l'écran. */
export function showNoisePulse(scene: Phaser.Scene, x: number, y: number, radius: number, quay: boolean): void {
  const pulse = scene.add.graphics().setPosition(x, y).setDepth(3600);
  const accent = quay ? 0xff4f9e : 0xffa338;
  const core = quay ? 0xffd3e7 : 0xffedb8;

  const draw = (progress: number) => {
    pulse.clear();
    const sourceAlpha = Math.min(1, (1 - progress) * 1.7);
    pulse.fillStyle(accent, sourceAlpha * 0.25).fillCircle(0, 0, 8);
    pulse.lineStyle(1.3, core, sourceAlpha).strokeCircle(0, 0, 6);
    pulse.fillStyle(core, sourceAlpha).fillCircle(0, 0, 2.3);

    // Le front secondaire donne un sens de propagation dès les premiers instants.
    for (const delay of [0, 0.16]) {
      if (progress < delay) continue;
      const travel = (progress - delay) / (1 - delay);
      const r = 8 + (Math.max(8, radius) - 8) * travel;
      const alpha = (1 - travel ** 2) * (delay === 0 ? 1 : 0.62);
      pulse.lineStyle(6, accent, alpha * 0.22).strokeCircle(0, 0, r);
      pulse.lineStyle(3.2, 0x10131c, alpha * 0.85).strokeCircle(0, 0, r);
      pulse.lineStyle(1.6, core, alpha).strokeCircle(0, 0, r);
    }
  };

  draw(0);
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: quay ? 1450 : 1150,
    onUpdate: (tween) => draw(tween.getValue() ?? 0),
    onComplete: () => pulse.destroy(),
  });
}
