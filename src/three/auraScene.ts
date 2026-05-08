import * as THREE from 'three';
import type { Point3D } from '../gesture/types';
import {
  buildTarotCardFallbackDataUrl,
  resolveTarotCardFaceSource
} from '../tarot/cardArt';
import { tarotDeck } from '../tarot/tarotDeck';
import type { DeckCardLayout, SpreadDefinition } from '../tarot/types';

interface CardVisual {
  id: string;
  stackIndex: number;
  group: THREE.Group;
  body: THREE.Mesh;
  glowMaterial: THREE.MeshBasicMaterial;
  boxMaterials: THREE.MeshStandardMaterial[];
  revealedFaceOverlayMaterial: THREE.MeshBasicMaterial;
  hiddenBackMaterial: THREE.MeshStandardMaterial;
  revealedFrontMaterial: THREE.MeshStandardMaterial;
  hiddenBackBorderMaterial: THREE.MeshBasicMaterial;
  revealedFrontBorderMaterial: THREE.MeshBasicMaterial;
  hiddenBackSigilMaterial: THREE.MeshBasicMaterial;
  revealedFrontSigilMaterial: THREE.MeshBasicMaterial;
  revealedTexture: THREE.Texture | null;
  loadingTexture: boolean;
  targetPosition: THREE.Vector3;
  targetRotation: THREE.Vector3;
  targetScale: number;
  targetGlowOpacity: number;
  targetEmissiveIntensity: number;
}

interface SlotGuide {
  group: THREE.Group;
  glowMaterial: THREE.MeshBasicMaterial;
  fillMaterial: THREE.MeshBasicMaterial;
  lineMaterial: THREE.LineBasicMaterial;
}

export class AuraScene {
  private readonly container: HTMLDivElement;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  private readonly renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true
  });
  private readonly textureLoader = new THREE.TextureLoader();
  private readonly raycaster = new THREE.Raycaster();
  private readonly raycastPointer = new THREE.Vector2();
  private readonly interactionPlane = new THREE.Plane(
    new THREE.Vector3(0, 0, 1),
    0
  );
  private readonly pointerMesh: THREE.Mesh;
  private readonly pointerGlow: THREE.Mesh;
  private readonly pointerLight: THREE.PointLight;
  private readonly revealLight: THREE.PointLight;
  private readonly haloRing: THREE.Mesh;
  private readonly stardustField: THREE.Group;
  private readonly stardustLayers: Array<{
    material: THREE.PointsMaterial;
    baseOpacity: number;
    speed: number;
    phase: number;
  }> = [];
  private readonly particleField: THREE.Points;
  private readonly mistShell: THREE.Mesh;
  private readonly deckGroup = new THREE.Group();
  private readonly guideGroup = new THREE.Group();
  private readonly currentPosition = new THREE.Vector3(0, 0, 0.75);
  private readonly targetPosition = new THREE.Vector3(0, 0, 0.75);
  private readonly cardVisuals = new Map<string, CardVisual>();
  private readonly slotGuides: SlotGuide[] = [];
  private readonly revealStateById = new Map<string, boolean>();
  private deckLayoutById = new Map<string, DeckCardLayout>();
  private animationFrame = 0;
  private hasHand = false;
  private pointerLightTargetIntensity = 18;
  private particleOpacityTarget = 0.86;
  private fanOutStartedAt = 0;
  private shuffleState:
    | {
        startedAt: number;
        duration: number;
        offsets: Map<string, { position: THREE.Vector3; rotationZ: number }>;
      }
    | null = null;
  private revealPulse:
    | {
        startedAt: number;
        position: THREE.Vector3;
      }
    | null = null;

  constructor(container: HTMLDivElement) {
    this.container = container;

    this.scene.fog = new THREE.FogExp2('#090314', 0.048);
    this.camera.position.set(0, 0.6, 14);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.42;

    this.container.appendChild(this.renderer.domElement);

    this.pointerMesh = this.createPointerMesh();
    this.pointerGlow = this.createPointerGlow();
    this.pointerLight = this.createPointerLight();
    this.revealLight = this.createRevealLight();
    this.haloRing = this.createHaloRing();
    this.stardustField = this.createStardustField();
    this.particleField = this.createParticleField();
    this.mistShell = this.createMistShell();

    this.setupLights();
    this.setupDeck();
    this.setupSlotGuides();
    this.setupScene();
    this.resize();
    this.animate();
  }

  setPointerTarget(point: Point3D | null) {
    if (point) {
      this.targetPosition.set(point.x, point.y, point.z);
      this.hasHand = true;
      return;
    }

    this.hasHand = false;
  }

  setDeckState(cards: DeckCardLayout[], spread: SpreadDefinition) {
    this.deckLayoutById = new Map(cards.map((card) => [card.id, card]));
    this.pointerLightTargetIntensity = cards.some((card) => card.isHovered)
      ? 24
      : 18;

    spread.slots.forEach((slot, index) => {
      const guide = this.slotGuides[index];
      const filled = cards.some((card) => card.selectionIndex === index);

      if (!guide) {
        return;
      }

      guide.group.visible = true;
      guide.group.position.set(slot.x, slot.y, slot.z - 0.2);
      guide.glowMaterial.opacity = filled ? 0.22 : 0.1;
      guide.fillMaterial.opacity = filled ? 0.14 : 0.06;
      guide.lineMaterial.color.set(filled ? '#ffe28f' : '#ffcc33');
      guide.lineMaterial.opacity = filled ? 0.9 : 0.46;
    });

    for (let index = spread.slots.length; index < this.slotGuides.length; index += 1) {
      this.slotGuides[index].group.visible = false;
    }
  }

  playFanOut() {
    this.fanOutStartedAt = performance.now() * 0.001;
    this.particleOpacityTarget = 0.95;
  }

  playShuffleChaos() {
    const offsets = new Map<
      string,
      { position: THREE.Vector3; rotationZ: number }
    >();
    const view = getViewSizeAtDepth(this.camera, 0);
    const scatterWidth = Math.max(view.width * 0.4, 7.2);
    const scatterHeight = Math.max(view.height * 0.28, 3.6);

    for (const visual of this.cardVisuals.values()) {
      const stackPosition = getStackPosition(visual.stackIndex);
      offsets.set(visual.id, {
        position: new THREE.Vector3(
          stackPosition.x + (Math.random() - 0.5) * scatterWidth,
          stackPosition.y + (Math.random() - 0.5) * scatterHeight,
          0.9 + Math.random() * 1.8
        ),
        rotationZ: (Math.random() - 0.5) * 1.3
      });
    }

    this.shuffleState = {
      startedAt: performance.now() * 0.001,
      duration: 0.72,
      offsets
    };
    this.pointerLightTargetIntensity = 26;
    this.particleOpacityTarget = 1;
  }

  pickPointerTarget(clientX: number, clientY: number) {
    const rect = this.container.getBoundingClientRect();

    if (!rect.width || !rect.height) {
      return null;
    }

    this.raycastPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.raycastPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.raycastPointer, this.camera);

    const meshes = Array.from(this.cardVisuals.values()).map((visual) => visual.body);
    const intersections = this.raycaster.intersectObjects(meshes, false);
    const hit = intersections[0];

    if (hit) {
      const cardId = hit.object.userData.cardId as string | undefined;

      return {
        cardId: cardId ?? null,
        pointerWorld: toPoint3D(hit.point)
      };
    }

    const fallbackPoint = new THREE.Vector3();
    const planeHit = this.raycaster.ray.intersectPlane(
      this.interactionPlane,
      fallbackPoint
    );

    return {
      cardId: null,
      pointerWorld: planeHit ? toPoint3D(fallbackPoint) : null
    };
  }

  resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose() {
    cancelAnimationFrame(this.animationFrame);
    this.renderer.dispose();
    this.scene.traverse((object: any) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Points ||
        object instanceof THREE.LineSegments
      ) {
        object.geometry.dispose();

        const { material } = object;
        if (Array.isArray(material)) {
          for (const entry of material) {
            if ('map' in entry && entry.map) {
              entry.map.dispose();
            }
            entry.dispose();
          }
        } else {
          if ('map' in material && material.map) {
            material.map.dispose();
          }
          material.dispose();
        }
      }
    });
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  private setupScene() {
    const wireSphere = new THREE.Mesh(
      new THREE.IcosahedronGeometry(4.7, 1),
      new THREE.MeshBasicMaterial({
        color: '#5f2aa6',
        wireframe: true,
        transparent: true,
        opacity: 0.16
      })
    );

    this.scene.add(
      this.stardustField,
      wireSphere,
      this.mistShell,
      this.haloRing,
      this.guideGroup,
      this.deckGroup,
      this.pointerGlow,
      this.pointerMesh,
      this.pointerLight,
      this.revealLight,
      this.particleField
    );
  }

  private setupDeck() {
    for (const [index, card] of tarotDeck.entries()) {
      const visual = this.createCardVisual(card.id, index);
      this.cardVisuals.set(card.id, visual);
      this.deckGroup.add(visual.group);
    }
  }

  private setupSlotGuides() {
    for (let index = 0; index < 9; index += 1) {
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: '#ffcc33',
        transparent: true,
        opacity: 0.1,
        depthWrite: false
      });
      const fillMaterial = new THREE.MeshBasicMaterial({
        color: '#f3c762',
        transparent: true,
        opacity: 0.06
      });
      const lineMaterial = new THREE.LineBasicMaterial({
        color: '#ffcc33',
        transparent: true,
        opacity: 0.46
      });

      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(1.1, 1.7),
        glowMaterial
      );
      glow.position.z = -0.05;
      glow.renderOrder = 1;
      const fill = new THREE.Mesh(
        new THREE.PlaneGeometry(0.92, 1.52),
        fillMaterial
      );
      fill.renderOrder = 2;
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.92, 1.52)),
        lineMaterial
      );
      outline.renderOrder = 3;

      const group = new THREE.Group();
      group.visible = false;
      group.add(glow, fill, outline);
      this.guideGroup.add(group);
      this.slotGuides.push({
        group,
        glowMaterial,
        fillMaterial,
        lineMaterial
      });
    }
  }

  private setupLights() {
    const ambientLight = new THREE.AmbientLight('#655487', 1.05);

    const backLight = new THREE.PointLight('#6d40ff', 9.5, 34, 2);
    backLight.position.set(-5.5, 4.5, -2.5);

    const candleLight = new THREE.PointLight('#ffcc33', 15.5, 30, 2);
    candleLight.position.set(4.5, 3.6, 5.5);

    const fillLight = new THREE.PointLight('#ffd78a', 6.5, 24, 2);
    fillLight.position.set(0, 1.8, 8.2);

    this.scene.add(ambientLight, backLight, candleLight, fillLight);
  }

  private createPointerMesh() {
    return new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 24, 24),
      new THREE.MeshBasicMaterial({
        color: '#fff4c2'
      })
    );
  }

  private createPointerGlow() {
    return new THREE.Mesh(
      new THREE.SphereGeometry(0.52, 24, 24),
      new THREE.MeshBasicMaterial({
        color: '#ffcc33',
        transparent: true,
        opacity: 0.14
      })
    );
  }

  private createPointerLight() {
    const light = new THREE.PointLight('#ffcc33', 18, 14, 2);
    light.position.copy(this.currentPosition);
    return light;
  }

  private createRevealLight() {
    const light = new THREE.PointLight('#ffcc33', 0, 12, 2);
    light.position.set(0, 0, 2.6);
    return light;
  }

  private createCardVisual(cardId: string, index: number) {
    const group = new THREE.Group();
    group.name = cardId;
    const stackPosition = getStackPosition(index);
    group.position.set(stackPosition.x, stackPosition.y, stackPosition.z);

    const boxMaterials = [
      new THREE.MeshStandardMaterial({
        color: '#24345f',
        emissive: '#5348be',
        emissiveIntensity: 0.42,
        metalness: 0.25,
        roughness: 0.62
      }),
      new THREE.MeshStandardMaterial({
        color: '#24345f',
        emissive: '#5348be',
        emissiveIntensity: 0.42,
        metalness: 0.25,
        roughness: 0.62
      }),
      new THREE.MeshStandardMaterial({
        color: '#24345f',
        emissive: '#5348be',
        emissiveIntensity: 0.42,
        metalness: 0.25,
        roughness: 0.62
      }),
      new THREE.MeshStandardMaterial({
        color: '#24345f',
        emissive: '#5348be',
        emissiveIntensity: 0.42,
        metalness: 0.25,
        roughness: 0.62
      }),
      new THREE.MeshStandardMaterial({
        color: '#1b112f',
        emissive: '#5c57df',
        emissiveIntensity: 0.84,
        metalness: 0.3,
        roughness: 0.45
      }),
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        emissive: '#000000',
        emissiveIntensity: 0,
        metalness: 0,
        roughness: 1,
        transparent: true,
        opacity: 0.08
      })
    ];

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.82, 1.42, 0.05),
      boxMaterials
    );
    body.userData.cardId = cardId;

    const hiddenBackBorderMaterial = new THREE.MeshBasicMaterial({
      color: '#7d7cff',
      transparent: true,
      opacity: 0.56
    });
    const revealedFrontBorderMaterial = new THREE.MeshBasicMaterial({
      color: '#7d7cff',
      transparent: true,
      opacity: 0.02
    });
    const hiddenBackSigilMaterial = new THREE.MeshBasicMaterial({
      color: '#8b77ff',
      transparent: true,
      opacity: 0.72
    });
    const revealedFrontSigilMaterial = new THREE.MeshBasicMaterial({
      color: '#8b77ff',
      transparent: true,
      opacity: 0.02
    });

    const frontBorder = new THREE.Mesh(
      new THREE.PlaneGeometry(0.66, 1.2),
      hiddenBackBorderMaterial
    );
    frontBorder.position.z = 0.026;
    frontBorder.renderOrder = 4;

    const backBorder = new THREE.Mesh(
      new THREE.PlaneGeometry(0.66, 1.2),
      revealedFrontBorderMaterial
    );
    backBorder.position.z = -0.026;
    backBorder.rotation.y = Math.PI;
    backBorder.renderOrder = 5;

    const frontSigil = createInfinitySigil(hiddenBackSigilMaterial);
    frontSigil.position.z = 0.028;
    frontSigil.renderOrder = 4;

    const backSigil = createInfinitySigil(revealedFrontSigilMaterial);
    backSigil.position.z = -0.028;
    backSigil.rotation.y = Math.PI;
    backSigil.renderOrder = 5;

    const revealedFaceOverlayMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      toneMapped: false,
      depthTest: false
    });
    const revealedFaceOverlay = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 1.4),
      revealedFaceOverlayMaterial
    );
    revealedFaceOverlay.position.z = -0.031;
    revealedFaceOverlay.rotation.y = Math.PI;
    revealedFaceOverlay.renderOrder = 12;

    const glowMaterial = new THREE.MeshBasicMaterial({
      color: '#7a70ff',
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.05, 1.66),
      glowMaterial
    );
    glow.position.z = -0.05;

    group.add(
      glow,
      body,
      frontBorder,
      backBorder,
      frontSigil,
      backSigil,
      revealedFaceOverlay
    );

    return {
      id: cardId,
      stackIndex: index,
      group,
      body,
      glowMaterial,
      boxMaterials,
      revealedFaceOverlayMaterial,
      hiddenBackMaterial: boxMaterials[4],
      revealedFrontMaterial: boxMaterials[5],
      hiddenBackBorderMaterial,
      revealedFrontBorderMaterial,
      hiddenBackSigilMaterial,
      revealedFrontSigilMaterial,
      revealedTexture: null,
      loadingTexture: false,
      targetPosition: group.position.clone(),
      targetRotation: new THREE.Vector3(0, 0, 0),
      targetScale: 1,
      targetGlowOpacity: 0.12,
      targetEmissiveIntensity: 0.82
    };
  }

  private async loadCardFaceTexture(
    cardId: string,
    label: string,
    visual: CardVisual
  ) {
    visual.loadingTexture = true;

    const source = await resolveTarotCardFaceSource({ id: cardId, label });
    const fallbackSource = buildTarotCardFallbackDataUrl(label);

    this.textureLoader.load(
      source,
      (texture: any) => {
        this.applyCardTexture(visual, texture);
      },
      undefined,
      () => {
        this.textureLoader.load(fallbackSource, (texture: any) => {
          this.applyCardTexture(visual, texture);
        }, undefined, () => {
          visual.loadingTexture = false;
        });
      }
    );
  }

  private applyCardTexture(visual: CardVisual, texture: THREE.Texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    if (visual.revealedTexture) {
      visual.revealedTexture.dispose();
    }

    visual.revealedTexture = texture;
    visual.revealedFaceOverlayMaterial.map = texture;
    visual.revealedFaceOverlayMaterial.needsUpdate = true;
    visual.loadingTexture = false;
  }

  private createHaloRing() {
    const ring = new THREE.Mesh(
      new THREE.TorusKnotGeometry(1.3, 0.14, 140, 16),
      new THREE.MeshStandardMaterial({
        color: '#2f1557',
        emissive: '#8d45ff',
        emissiveIntensity: 1.15,
        metalness: 0.38,
        roughness: 0.28,
        transparent: true,
        opacity: 0.55
      })
    );

    ring.position.set(0, 0, -1);

    return ring;
  }

  private createMistShell() {
    return new THREE.Mesh(
      new THREE.SphereGeometry(8.8, 32, 32),
      new THREE.MeshBasicMaterial({
        color: '#130922',
        transparent: true,
        opacity: 0.07,
        side: THREE.BackSide
      })
    );
  }

  private createStardustField() {
    const group = new THREE.Group();
    const layers = [
      {
        count: 260,
        minRadius: 7.5,
        maxRadius: 14.5,
        size: 0.07,
        baseOpacity: 0.4,
        speed: 0.9,
        palette: ['#fff6d4', '#dbe8ff']
      },
      {
        count: 420,
        minRadius: 5.8,
        maxRadius: 11.6,
        size: 0.045,
        baseOpacity: 0.26,
        speed: 1.35,
        palette: ['#fff0c0', '#bfd5ff']
      }
    ];

    layers.forEach((layer, index) => {
      const positions = new Float32Array(layer.count * 3);
      const colors = new Float32Array(layer.count * 3);

      for (let cardIndex = 0; cardIndex < layer.count; cardIndex += 1) {
        const stride = cardIndex * 3;
        const radius =
          layer.minRadius + Math.random() * (layer.maxRadius - layer.minRadius);
        const theta = Math.random() * Math.PI * 2;
        const y = (Math.random() - 0.5) * 9.2;
        const x = Math.cos(theta) * radius;
        const z = Math.sin(theta) * radius;
        const tone = new THREE.Color(
          layer.palette[Math.floor(Math.random() * layer.palette.length)]
        );

        positions[stride] = x;
        positions[stride + 1] = y;
        positions[stride + 2] = z;
        colors[stride] = tone.r;
        colors[stride + 1] = tone.g;
        colors[stride + 2] = tone.b;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const material = new THREE.PointsMaterial({
        size: layer.size,
        vertexColors: true,
        transparent: true,
        opacity: layer.baseOpacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
      });

      const points = new THREE.Points(geometry, material);
      points.rotation.x = index === 0 ? 0.12 : -0.08;
      group.add(points);
      this.stardustLayers.push({
        material,
        baseOpacity: layer.baseOpacity,
        speed: layer.speed,
        phase: Math.random() * Math.PI * 2
      });
    });

    return group;
  }

  private createParticleField() {
    const count = 900;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let index = 0; index < count; index += 1) {
      const stride = index * 3;
      const radius = 4 + Math.random() * 8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[stride] = radius * Math.sin(phi) * Math.cos(theta);
      positions[stride + 1] = radius * Math.cos(phi) * 0.65;
      positions[stride + 2] = radius * Math.sin(phi) * Math.sin(theta);

      const palette =
        Math.random() > 0.4
          ? new THREE.Color('#ffd97a')
          : new THREE.Color('#8c5dff');

      colors[stride] = palette.r;
      colors[stride + 1] = palette.g;
      colors[stride + 2] = palette.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.045,
        vertexColors: true,
        transparent: true,
        opacity: 0.86,
        depthWrite: false
      })
    );
  }

  private readonly animate = () => {
    this.animationFrame = requestAnimationFrame(this.animate);

    const elapsed = performance.now() * 0.001;

    if (!this.hasHand) {
      this.targetPosition.set(
        Math.sin(elapsed * 0.9) * 1.4,
        Math.cos(elapsed * 0.7) * 0.9,
        Math.sin(elapsed * 0.5) * 1.2
      );
    }

    this.currentPosition.lerp(this.targetPosition, 0.12);

    const pulse = 1 + Math.sin(elapsed * 4.2) * 0.08;
    const particleMaterial = this.particleField.material as THREE.PointsMaterial;
    const mistMaterial = this.mistShell.material as THREE.MeshBasicMaterial;
    this.pointerLight.intensity = THREE.MathUtils.lerp(
      this.pointerLight.intensity,
      this.pointerLightTargetIntensity,
      0.1
    );
    particleMaterial.opacity = THREE.MathUtils.lerp(
      particleMaterial.opacity,
      this.particleOpacityTarget,
      0.08
    );
    mistMaterial.opacity = THREE.MathUtils.lerp(
      mistMaterial.opacity,
      this.shuffleState ? 0.14 : 0.07,
      0.08
    );

    this.pointerMesh.position.copy(this.currentPosition);
    this.pointerGlow.position.copy(this.currentPosition);
    this.pointerGlow.scale.setScalar(pulse);
    this.pointerLight.position.copy(this.currentPosition);

    this.haloRing.rotation.x = elapsed * 0.18;
    this.haloRing.rotation.y = elapsed * 0.31;
    this.haloRing.rotation.z = elapsed * 0.12;
    this.stardustField.rotation.y += 0.00018;
    this.stardustField.rotation.z = Math.sin(elapsed * 0.08) * 0.04;

    this.stardustLayers.forEach((layer, index) => {
      const twinkle = 0.78 + Math.sin(elapsed * layer.speed + layer.phase) * 0.22;
      layer.material.opacity = layer.baseOpacity * twinkle;
      layer.material.size = index === 0
        ? 0.07 + Math.sin(elapsed * 0.45 + layer.phase) * 0.004
        : 0.045 + Math.sin(elapsed * 0.7 + layer.phase) * 0.003;
    });

    if (this.shuffleState && elapsed - this.shuffleState.startedAt >= this.shuffleState.duration) {
      this.shuffleState = null;
      this.particleOpacityTarget = 0.86;
      this.playFanOut();
    }

    for (const visual of this.cardVisuals.values()) {
      const layout = this.deckLayoutById.get(visual.id);

      if (!layout) {
        continue;
      }

      if (layout.isSelected && !visual.revealedTexture && !visual.loadingTexture) {
        void this.loadCardFaceTexture(visual.id, layout.label, visual);
      }

      visual.targetPosition.set(
        layout.position.x,
        layout.position.y,
        layout.position.z
      );
      visual.targetRotation.set(
        layout.rotation.x,
        layout.rotation.y,
        layout.rotation.z
      );
      visual.targetScale = layout.scale;
      visual.targetGlowOpacity = layout.isSelected
        ? layout.isRevealed
          ? 0.42
          : 0.36
        : layout.isHovered
          ? 0.26
          : 0.12;
      visual.targetEmissiveIntensity = layout.isSelected
        ? 1.5
        : layout.isHovered
          ? 1.12
          : 0.82;

      const wasRevealed = this.revealStateById.get(visual.id) ?? false;
      if (layout.isRevealed && !wasRevealed) {
        this.revealPulse = {
          startedAt: elapsed,
          position: new THREE.Vector3(
            layout.position.x,
            layout.position.y - 0.2,
            layout.position.z + 1.4
          )
        };
      }
      this.revealStateById.set(visual.id, layout.isRevealed);

      let animatedPosition: THREE.Vector3 | null = null;
      let animatedRotation: THREE.Vector3 | null = null;

      if (!layout.isSelected && this.shuffleState) {
        const offset = this.shuffleState.offsets.get(visual.id);
        const intensity = getShuffleIntensity(
          elapsed,
          this.shuffleState.startedAt,
          this.shuffleState.duration
        );

        if (offset && intensity > 0) {
          const stackPosition = getStackPosition(visual.stackIndex);
          const stackRotation = getStackRotation(visual.stackIndex);
          animatedPosition = new THREE.Vector3(
            THREE.MathUtils.lerp(stackPosition.x, offset.position.x, intensity),
            THREE.MathUtils.lerp(stackPosition.y, offset.position.y, intensity),
            THREE.MathUtils.lerp(stackPosition.z, offset.position.z, intensity)
          );
          animatedRotation = new THREE.Vector3(
            THREE.MathUtils.lerp(stackRotation.x, stackRotation.x + 0.08, intensity),
            THREE.MathUtils.lerp(stackRotation.y, 0, intensity),
            THREE.MathUtils.lerp(stackRotation.z, offset.rotationZ, intensity)
          );
        }
      }

      if (!layout.isSelected && !animatedPosition) {
        const fanProgress = getStaggerProgress(
          elapsed,
          this.fanOutStartedAt,
          layout.orderIndex
        );

        if (fanProgress < 1) {
          const eased = easeOutBack(fanProgress);
          const stackPosition = getStackPosition(visual.stackIndex);
          const stackRotation = getStackRotation(visual.stackIndex);

          animatedPosition = new THREE.Vector3(
            THREE.MathUtils.lerp(stackPosition.x, visual.targetPosition.x, eased),
            THREE.MathUtils.lerp(stackPosition.y, visual.targetPosition.y, eased),
            THREE.MathUtils.lerp(stackPosition.z, visual.targetPosition.z, eased)
          );
          animatedRotation = new THREE.Vector3(
            THREE.MathUtils.lerp(stackRotation.x, visual.targetRotation.x, eased),
            THREE.MathUtils.lerp(stackRotation.y, visual.targetRotation.y, eased),
            THREE.MathUtils.lerp(stackRotation.z, visual.targetRotation.z, eased)
          );
        }
      }

      if (animatedPosition && animatedRotation) {
        visual.group.position.copy(animatedPosition);
        visual.group.rotation.set(
          animatedRotation.x,
          animatedRotation.y,
          animatedRotation.z
        );
      } else {
        visual.group.position.lerp(
          visual.targetPosition,
          layout.isSelected ? 0.15 : 0.12
        );
        visual.group.rotation.x = lerpAngle(
          visual.group.rotation.x,
          visual.targetRotation.x,
          0.14
        );
        visual.group.rotation.y = lerpAngle(
          visual.group.rotation.y,
          visual.targetRotation.y,
          0.14
        );
        visual.group.rotation.z = lerpAngle(
          visual.group.rotation.z,
          visual.targetRotation.z,
          0.14
        );
      }

      if (layout.isSelected) {
        visual.group.position.z +=
          Math.sin(elapsed * 1.6 + (layout.selectionIndex ?? 0)) * 0.025;
      }

      const nextScale = THREE.MathUtils.lerp(
        visual.group.scale.x,
        visual.targetScale,
        0.14
      );
      visual.group.scale.set(nextScale, nextScale, 1);
      visual.glowMaterial.opacity = THREE.MathUtils.lerp(
        visual.glowMaterial.opacity,
        visual.targetGlowOpacity,
        0.16
      );

      visual.hiddenBackMaterial.emissiveIntensity = THREE.MathUtils.lerp(
        visual.hiddenBackMaterial.emissiveIntensity,
        layout.isRevealed ? 0.22 : visual.targetEmissiveIntensity,
        0.16
      );
      visual.revealedFrontMaterial.emissiveIntensity = THREE.MathUtils.lerp(
        visual.revealedFrontMaterial.emissiveIntensity,
        layout.isRevealed ? 0.16 : 0.12,
        0.16
      );
      visual.revealedFaceOverlayMaterial.opacity = THREE.MathUtils.lerp(
        visual.revealedFaceOverlayMaterial.opacity,
        layout.isRevealed ? 1 : 0,
        0.2
      );
      visual.hiddenBackBorderMaterial.opacity = THREE.MathUtils.lerp(
        visual.hiddenBackBorderMaterial.opacity,
        layout.isRevealed
          ? 0.05
          : layout.isSelected
            ? 0.28
            : layout.isHovered
              ? 0.22
              : 0.3,
        0.16
      );
      visual.revealedFrontBorderMaterial.opacity = THREE.MathUtils.lerp(
        visual.revealedFrontBorderMaterial.opacity,
        0,
        0.16
      );
      visual.hiddenBackSigilMaterial.opacity = THREE.MathUtils.lerp(
        visual.hiddenBackSigilMaterial.opacity,
        layout.isRevealed
          ? 0.04
          : layout.isSelected
            ? 0.12
            : layout.isHovered
              ? 0.08
              : 0.18,
        0.16
      );
      visual.revealedFrontSigilMaterial.opacity = THREE.MathUtils.lerp(
        visual.revealedFrontSigilMaterial.opacity,
        0,
        0.16
      );
    }

    this.particleField.rotation.y += 0.0005;
    this.particleField.rotation.x = Math.sin(elapsed * 0.12) * 0.08;
    this.mistShell.rotation.y -= 0.00035;

    if (this.revealPulse) {
      const progress = (elapsed - this.revealPulse.startedAt) / 0.72;

      if (progress >= 1) {
        this.revealPulse = null;
      } else {
        const intensity = Math.sin((1 - progress) * Math.PI);
        this.revealLight.position.copy(this.revealPulse.position);
        this.revealLight.intensity = intensity * 22;
      }
    } else {
      this.revealLight.intensity = THREE.MathUtils.lerp(
        this.revealLight.intensity,
        0,
        0.18
      );
    }

    this.renderer.render(this.scene, this.camera);
  };
}

function lerpAngle(current: number, target: number, amount: number) {
  return current + (target - current) * amount;
}

function createInfinitySigil(material: THREE.MeshBasicMaterial) {
  const points: THREE.Vector3[] = [];

  for (let index = 0; index <= 72; index += 1) {
    const t = (index / 72) * Math.PI * 2;
    const sin = Math.sin(t);
    const cos = Math.cos(t);
    const denominator = 1 + sin * sin;
    const x = (Math.SQRT2 * cos) / denominator;
    const y = (Math.SQRT2 * cos * sin) / denominator;

    points.push(new THREE.Vector3(x * 0.17, y * 0.12, 0));
  }

  const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal');

  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, 96, 0.012, 10, true),
    material
  );
}

function getStackPosition(index: number) {
  return new THREE.Vector3(0, -0.2, -index * 0.014);
}

function getStackRotation(index: number) {
  return new THREE.Vector3(0.08, 0, (index % 6 - 3) * 0.01);
}

function getStaggerProgress(
  elapsed: number,
  startedAt: number,
  orderIndex: number
) {
  if (startedAt === 0) {
    return 1;
  }

  const delay = orderIndex * 0.02;
  return THREE.MathUtils.clamp((elapsed - startedAt - delay) / 0.72, 0, 1);
}

function getShuffleIntensity(
  elapsed: number,
  startedAt: number,
  duration: number
) {
  const progress = THREE.MathUtils.clamp((elapsed - startedAt) / duration, 0, 1);

  if (progress <= 0 || progress >= 1) {
    return 0;
  }

  return Math.sin(progress * Math.PI);
}

function easeOutBack(progress: number) {
  const overshoot = 1.70158;
  const t = progress - 1;
  return 1 + (overshoot + 1) * t * t * t + overshoot * t * t;
}

function toPoint3D(point: THREE.Vector3) {
  return {
    x: point.x,
    y: point.y,
    z: point.z
  };
}

function getViewSizeAtDepth(camera: THREE.PerspectiveCamera, targetZ: number) {
  const distance = Math.abs(camera.position.z - targetZ);
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const height = 2 * Math.tan(verticalFov / 2) * distance;

  return {
    width: height * camera.aspect,
    height
  };
}
