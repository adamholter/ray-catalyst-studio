export type TaskType = 'mockup' | 'logo' | 'asset' | 'deck';

export interface FieldSpec {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'range';
  default: any;
  options?: string[]; // For select
  min?: number;       // For range/number
  max?: number;       // For range/number
  step?: number;      // For range
}

export interface ModelSpec {
  id: string;
  name: string;
  task: TaskType;
  description: string;
  fields: FieldSpec[];
  outputShape: string;
  synthIdStatus: 'Active' | 'Active (Metadata)' | 'Active (Watermarked)' | 'Inactive';
  defaultPostprocessors: string[];
  supportedUpscalers: string[];
}

export interface UpscalerSpec {
  id: string;
  name: string;
  description: string;
  multiplier: string;
}

export interface Capabilities {
  tasks: { id: TaskType; label: string }[];
  models: ModelSpec[];
  upscalers: UpscalerSpec[];
}

// Fallback high-fidelity mock data for design & development
export const MOCK_CAPABILITIES: Capabilities = {
  tasks: [
    { id: 'mockup', label: 'Mockup Generation' },
    { id: 'logo', label: 'Logo Vectorizer' },
    { id: 'asset', label: '3D Asset Craft' },
    { id: 'deck', label: 'Slide Deck Architect' }
  ],
  models: [
    {
      id: 'catalyst-mockup-v2',
      name: 'Catalyst-Mockup-v2',
      task: 'mockup',
      description: 'High-fidelity photorealistic mockup generator optimized for print, packaging, and digital layouts.',
      outputShape: '1024 × 1024 px, PNG (RGBA)',
      synthIdStatus: 'Active',
      defaultPostprocessors: ['Background Removal', 'Color Balancing'],
      supportedUpscalers: ['esrgan-4x', 'lama-inpaint-v2'],
      fields: [
        {
          name: 'stylePreset',
          label: 'Style Preset',
          type: 'select',
          default: 'photorealistic',
          options: ['photorealistic', 'studio-lighting', 'claymation', 'isometric-vector', 'editorial-grain']
        },
        {
          name: 'negativePrompt',
          label: 'Negative Prompt',
          type: 'text',
          default: 'blurry, low quality, distorted, extra limbs, text overlays'
        },
        {
          name: 'guidanceScale',
          label: 'Guidance Scale',
          type: 'range',
          default: 7.5,
          min: 1,
          max: 20,
          step: 0.5
        },
        {
          name: 'steps',
          label: 'Sampling Steps',
          type: 'range',
          default: 30,
          min: 15,
          max: 50,
          step: 1
        },
        {
          name: 'aspectRatio',
          label: 'Aspect Ratio',
          type: 'select',
          default: '1:1',
          options: ['1:1', '16:9', '9:16', '4:3', '3:2']
        }
      ]
    },
    {
      id: 'logogen-vector-v1.5',
      name: 'LogoGen-Vector-v1.5',
      task: 'logo',
      description: 'Generates clean, scalable minimalist vector logos, icons, and geometric flat designs.',
      outputShape: 'Scalable Vector Graphic (SVG)',
      synthIdStatus: 'Active (Metadata)',
      defaultPostprocessors: ['SVG Path Cleanup', 'Subpixel Simplification', 'Mono Contrast Guard'],
      supportedUpscalers: [],
      fields: [
        {
          name: 'vectorFormat',
          label: 'Output Format',
          type: 'select',
          default: 'svg',
          options: ['svg', 'pdf', 'png-highres']
        },
        {
          name: 'logoStyle',
          label: 'Logo Aesthetic Style',
          type: 'select',
          default: 'brutalist-mono',
          options: ['brutalist-mono', 'art-deco', 'geometric-flat', 'swiss-typography', 'hand-drawn-minimal']
        },
        {
          name: 'simplifyLevel',
          label: 'Path Simplification (1-10)',
          type: 'range',
          default: 5,
          min: 1,
          max: 10,
          step: 1
        }
      ]
    },
    {
      id: 'assetcraft-3d-v1.1',
      name: 'AssetCraft-3D-v1.1',
      task: 'asset',
      description: 'Generates beautiful isolated 3D assets, UI icons, and character props with alpha transparency.',
      outputShape: '2048 × 2048 px, Transparent PNG',
      synthIdStatus: 'Inactive',
      defaultPostprocessors: ['Alpha Matting', 'Depth Estimation', 'Shadow Catcher Drop'],
      supportedUpscalers: ['esrgan-4x'],
      fields: [
        {
          name: 'assetType',
          label: 'Asset Classification',
          type: 'select',
          default: 'ui-icon',
          options: ['ui-icon', 'character-prop', 'environmental-item', 'texture-tile']
        },
        {
          name: 'renderStyle',
          label: 'Render Engine Aesthetic',
          type: 'select',
          default: 'isometric-glassmorphism',
          options: ['isometric-glassmorphism', 'flat-clay-bake', 'ambient-occlusion-wire', 'subsurface-plastic']
        },
        {
          name: 'lightingDirection',
          label: 'Lighting Preset',
          type: 'select',
          default: 'rim-key-light',
          options: ['rim-key-light', 'top-down-diffuse', 'neon-cyberpunk', 'warm-editorial']
        }
      ]
    },
    {
      id: 'slidedeck-architect-v0.9',
      name: 'SlideDeck-Architect-v0.9',
      task: 'deck',
      description: 'Dynamic structural slide deck creator using deliberate layouts, strict editorial design, and typography grids.',
      outputShape: 'Interactive Slide Deck (PDF/JSON)',
      synthIdStatus: 'Active (Watermarked)',
      defaultPostprocessors: ['Grid Alignment Locking', 'Font Hierarchy Auditor', 'Contrast Ratio Check'],
      supportedUpscalers: [],
      fields: [
        {
          name: 'slideCount',
          label: 'Number of Slides',
          type: 'range',
          default: 8,
          min: 4,
          max: 20,
          step: 1
        },
        {
          name: 'colorPalette',
          label: 'Editorial Color Palette',
          type: 'select',
          default: 'slate-editorial',
          options: ['slate-editorial', 'warm-terracotta', 'monochrome-brutalist', 'bauhaus-primary']
        },
        {
          name: 'typographyPreset',
          label: 'Typography Pairing',
          type: 'select',
          default: 'serif-display-sans-body',
          options: ['serif-display-sans-body', 'mono-display-mono-body', 'swiss-sans-bold']
        }
      ]
    }
  ],
  upscalers: [
    {
      id: 'none',
      name: 'None',
      description: 'Keep native output dimension without running neural post-upscaling.',
      multiplier: '1x'
    },
    {
      id: 'esrgan-4x',
      name: 'Real-ESRGAN-4x',
      description: 'State of the art neural upscaler that enhances edge sharpness and details.',
      multiplier: '4x'
    },
    {
      id: 'lama-inpaint-v2',
      name: 'LaMa-Inpaint-v2 (SuperRes)',
      description: 'High-fidelity inpainting-based super-resolution, excels at flat textures and vectors.',
      multiplier: '2x'
    }
  ]
};

export async function fetchCapabilities(): Promise<Capabilities> {
  try {
    const res = await fetch('/api/capabilities');
    if (!res.ok) throw new Error('API response error');
    return await res.json();
  } catch (err) {
    console.warn('GET /api/capabilities failed, returning high-fidelity client mock fallback.', err);
    return MOCK_CAPABILITIES;
  }
}
