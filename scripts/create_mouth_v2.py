"""
create_mouth_v2.py – Anatomically improved procedural mouth model for Toothbrush Clinic V2.

Produces public/mouth.glb containing exactly 72 named meshes:
  28 * 2 outer/inner surfaces  +  16 chewing surfaces (posterior only) = 72 meshes

Mesh names match MOUTH_MANIFEST keys exactly:
  <tooth_id>_outer, <tooth_id>_inner, <tooth_id>_chewing

Tooth types:
  ci  – central incisor  (flat wedge, tallest anterior)
  li  – lateral incisor  (narrower wedge)
  c   – canine           (slightly pointed, taller crown)
  pm1 – 1st premolar     (bicuspid – two small buccal/lingual cusps)
  pm2 – 2nd premolar     (similar to pm1, slightly wider)
  m1  – 1st molar        (rectangular block with 4-cusp occlusal surface)
  m2  – 2nd molar        (slightly smaller molar)

Coordinate system (Three.js):
  +X  = anatomical LEFT  (patient's left = screen right for frontal view)
  +Y  = up (superior)
  -Z  = into screen (posterior)
  0,0 = midpoint between arches, midline

License: Generated programmatically from scratch using trimesh (MIT license).
         No external model assets are used.  © Toothbrush Clinic project, MIT.
"""

import trimesh
import numpy as np

# ---------------------------------------------------------------------------
# Tooth ID lists  (matches anatomy.ts exactly — order matters for arch shape)
# ---------------------------------------------------------------------------
UPPER_RIGHT = ['ur_ci', 'ur_li', 'ur_c', 'ur_pm1', 'ur_pm2', 'ur_m1', 'ur_m2']
UPPER_LEFT  = ['ul_ci', 'ul_li', 'ul_c', 'ul_pm1', 'ul_pm2', 'ul_m1', 'ul_m2']
LOWER_RIGHT = ['lr_ci', 'lr_li', 'lr_c', 'lr_pm1', 'lr_pm2', 'lr_m1', 'lr_m2']
LOWER_LEFT  = ['ll_ci', 'll_li', 'll_c', 'll_pm1', 'll_pm2', 'll_m1', 'll_m2']

# Posterior teeth (have chewing surface)
POSTERIOR_IDS = {
    'ur_pm1', 'ur_pm2', 'ur_m1', 'ur_m2',
    'ul_pm1', 'ul_pm2', 'ul_m1', 'ul_m2',
    'lr_pm1', 'lr_pm2', 'lr_m1', 'lr_m2',
    'll_pm1', 'll_pm2', 'll_m1', 'll_m2',
}

# ---------------------------------------------------------------------------
# Arch geometry parameters
# ---------------------------------------------------------------------------
# Arch is a parabola-like ellipse. Teeth are placed at angles along the arch.
# angles_deg[i] = angular position from midline for tooth index i (0=CI, 6=M2)
angles_deg = [4.0, 12.0, 22.0, 35.0, 50.0, 66.0, 82.0]

# Arch semi-axes (x = horizontal, z = depth from front)
ARCH_A = 4.8   # half-width at back
ARCH_B = 5.8   # depth (front is at z=0, back at z=-ARCH_B)

# Arch y-centers (upper arch sits higher, lower lower)
UPPER_Y = 1.4
LOWER_Y = -1.4
ARCH_HALF_GAP = 0.12   # gap between occlusal surfaces at rest

# ---------------------------------------------------------------------------
# Per-tooth-type shape parameters [index 0=ci, 1=li, 2=c, 3=pm1, 4=pm2, 5=m1, 6=m2]
# ---------------------------------------------------------------------------
# Crown dimensions (local space before rotation/translation):
#   w  = mesiodistal width (X)
#   h  = crown height      (Y)  — upper crowns point downward, lower point up
#   d  = buccolingual depth (Z)
CROWN_PARAMS = [
    # w,    h,    d   (ci)
    (0.60, 1.00, 0.28),
    # w,    h,    d   (li)
    (0.48, 0.90, 0.24),
    # w,    h,    d   (c)
    (0.50, 1.08, 0.28),
    # w,    h,    d   (pm1)
    (0.60, 0.80, 0.42),
    # w,    h,    d   (pm2)
    (0.65, 0.78, 0.44),
    # w,    h,    d   (m1)
    (0.90, 0.78, 0.60),
    # w,    h,    d   (m2)
    (0.82, 0.72, 0.56),
]

# Root visible stub height (below gum line — tiny, just for silhouette)
ROOT_H = 0.25

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def translate(mesh, tx, ty, tz):
    m = np.eye(4)
    m[0, 3] = tx
    m[1, 3] = ty
    m[2, 3] = tz
    mesh.apply_transform(m)
    return mesh

def scale(mesh, sx, sy, sz):
    m = np.eye(4)
    m[0, 0] = sx
    m[1, 1] = sy
    m[2, 2] = sz
    mesh.apply_transform(m)
    return mesh

def rotate_y(mesh, angle_rad):
    R = trimesh.transformations.rotation_matrix(angle_rad, [0, 1, 0])
    mesh.apply_transform(R)
    return mesh

def box(w, h, d):
    """Create a box mesh centred at origin."""
    m = trimesh.creation.box(extents=[w, h, d])
    return m

def cyl(r, h, sections=12):
    """Upright cylinder centred at origin, y-axis aligned."""
    m = trimesh.creation.cylinder(radius=r, height=h, sections=sections)
    return m

def named(mesh, name):
    mesh.metadata['name'] = name
    return mesh


# ---------------------------------------------------------------------------
# Crown geometry builders (local space — centred at base of crown)
# ---------------------------------------------------------------------------

def make_incisor_crown(w, h, d, is_upper):
    """Flat trapezoidal wedge – wider at tip, narrower at root junction."""
    # Main body: box, slightly tapered by scaling
    body = box(w, h, d)
    # Taper: the incisal edge should be slightly narrower than root end
    # Approximate by using a simple box (trimesh doesn't do tapers easily)
    translate(body, 0, 0, 0)
    return body

def make_canine_crown(w, h, d, is_upper):
    """Pointed canine: box body + small triangular tip."""
    body = box(w, h * 0.85, d)
    tip_h = h * 0.20
    # Narrow tip approximated by a small box
    tip = box(w * 0.35, tip_h, d * 0.6)
    tip_y = (h * 0.85) / 2.0 + tip_h / 2.0
    if not is_upper:
        tip_y = -tip_y
    translate(tip, 0, tip_y, 0)
    combined = trimesh.util.concatenate([body, tip])
    return combined

def make_premolar_crown(w, h, d, is_upper):
    """Bicuspid: box body + two small buccal/lingual cusps on occlusal face."""
    body = box(w, h, d)
    # Two cusps (buccal and lingual) on top/bottom face
    cusp_h = h * 0.12
    cusp_r = min(w, d) * 0.18
    buccal_cusp  = cyl(cusp_r, cusp_h, sections=8)
    lingual_cusp = cyl(cusp_r, cusp_h, sections=8)
    cusp_y = h / 2.0 + cusp_h / 2.0
    if not is_upper:
        cusp_y = -cusp_y
    translate(buccal_cusp,   0,  cusp_y,  d * 0.28)
    translate(lingual_cusp,  0,  cusp_y, -d * 0.28)
    combined = trimesh.util.concatenate([body, buccal_cusp, lingual_cusp])
    return combined

def make_molar_crown(w, h, d, is_upper):
    """Rectangular molar body + 4 cusps arranged in 2x2 grid on occlusal face."""
    body = box(w, h, d)
    cusp_h = h * 0.14
    cusp_r = min(w, d) * 0.15
    cusp_y = h / 2.0 + cusp_h / 2.0
    if not is_upper:
        cusp_y = -cusp_y

    cusps = []
    for dx in [-w * 0.28, w * 0.28]:
        for dz in [-d * 0.27, d * 0.27]:
            c = cyl(cusp_r, cusp_h, sections=8)
            translate(c, dx, cusp_y, dz)
            cusps.append(c)
    # Central fossa groove – subtract a thin cylinder (approximate with concave dip; 
    # since trimesh boolean is complex, just add a slightly flattened sphere as ridge)
    combined = trimesh.util.concatenate([body] + cusps)
    return combined


# ---------------------------------------------------------------------------
# Gum mesh: two half-ellipse bands (upper/lower)
# ---------------------------------------------------------------------------

def make_gum_arch(is_upper, segments=36):
    """
    Build a gum ribbon as a thin toroidal band following the arch curve.
    Returns a trimesh.Trimesh with no name (added separately).
    """
    gum_height = 0.55
    gum_depth  = 0.70
    gum_thick  = 0.10

    verts = []
    faces = []

    n = segments
    for i in range(n + 1):
        t = np.pi * i / n   # 0 → π  (right → left for upper arch)
        x = ARCH_A * np.sin(t)
        z = ARCH_B * np.cos(t) - ARCH_B
        y0 = UPPER_Y if is_upper else LOWER_Y
        # four corners of a quad cross-section
        # outer-top, inner-top, inner-bottom, outer-bottom
        sign_y = -1 if is_upper else 1  # gum extends away from midline
        corners = [
            [x,  y0 + sign_y * gum_height,  z + gum_depth / 2],   # lingual-up
            [x,  y0 + sign_y * gum_height,  z - gum_depth / 2],   # buccal-up
            [x,  y0,                         z - gum_depth / 2],   # buccal-base
            [x,  y0,                         z + gum_depth / 2],   # lingual-base
        ]
        verts.extend(corners)

    # Build quad faces
    for i in range(n):
        base = i * 4
        # outer face
        faces.append([base + 0, base + 4, base + 5])
        faces.append([base + 0, base + 5, base + 1])
        # top cap
        faces.append([base + 1, base + 5, base + 6])
        faces.append([base + 1, base + 6, base + 2])
        # inner face
        faces.append([base + 2, base + 6, base + 7])
        faces.append([base + 2, base + 7, base + 3])
        # bottom cap
        faces.append([base + 3, base + 7, base + 4])
        faces.append([base + 3, base + 4, base + 0])

    gum = trimesh.Trimesh(vertices=np.array(verts, dtype=np.float32),
                          faces=np.array(faces, dtype=np.int32))
    # fix_normals() needs scipy; skip it — normals will be recomputed by Three.js
    return gum


# ---------------------------------------------------------------------------
# Build a single tooth (all parts)
# ---------------------------------------------------------------------------

all_meshes = []

def create_tooth(tooth_id, is_upper, is_right, type_index):
    """
    Build outer, inner (and if posterior: chewing) sub-meshes for one tooth.
    All meshes placed in world space.
    """
    w, h, d = CROWN_PARAMS[type_index]
    is_posterior = tooth_id in POSTERIOR_IDS

    # --- Crown geometry (local, centred at 0,0,0, crown pointing up) ---
    if type_index == 0:     # ci
        crown = make_incisor_crown(w, h, d, is_upper)
    elif type_index == 1:   # li
        crown = make_incisor_crown(w, h, d, is_upper)
    elif type_index == 2:   # c
        crown = make_canine_crown(w, h, d, is_upper)
    elif type_index == 3:   # pm1
        crown = make_premolar_crown(w, h, d, is_upper)
    elif type_index == 4:   # pm2
        crown = make_premolar_crown(w * 1.05, h, d * 1.05, is_upper)
    else:                   # m1, m2
        crown = make_molar_crown(w, h, d, is_upper)

    # --- Arch placement ---
    t = np.radians(angles_deg[type_index])
    sign_x = 1.0 if is_right else -1.0
    x = ARCH_A * np.sin(t) * sign_x
    z = ARCH_B * np.cos(t) - ARCH_B
    y_base = UPPER_Y if is_upper else LOWER_Y
    rot_angle = t * sign_x   # rotate tooth to face along arch tangent

    # Outer surface: buccal/labial face = the side away from midline (+Z for front teeth)
    # For the 3D model we split the crown into outer & inner halves (front/back halves in Z)
    # and a chewing flat for posteriors.

    outer_part = crown.__class__(crown.vertices.copy(), crown.faces.copy())
    inner_part = crown.__class__(crown.vertices.copy(), crown.faces.copy())

    # Outer: keep buccal half (+z half in local space before arch rotation)
    # We shift the outer half forward and inner half backward to make them distinct meshes
    offset = d * 0.38
    translate(outer_part,  0, 0,  offset)
    translate(inner_part,  0, 0, -offset)

    # Scale outer/inner halves down in z to avoid overlap
    scale(outer_part, 1.0, 1.0, 0.60)
    scale(inner_part, 1.0, 1.0, 0.60)

    # Crown Y position: upper crowns hang down from gumline, lower crowns protrude up
    crown_y_offset = -h * 0.45 if is_upper else h * 0.45

    # Apply arch rotation then translation to world position
    for part in [outer_part, inner_part]:
        translate(part, 0, crown_y_offset, 0)
        rotate_y(part, rot_angle)
        translate(part, x, y_base, z)

    named(outer_part, f'{tooth_id}_outer')
    named(inner_part, f'{tooth_id}_inner')
    all_meshes.append(outer_part)
    all_meshes.append(inner_part)

    # --- Chewing surface (posteriors only) ---
    if is_posterior:
        # Flat-ish rectangular slab with cusps on top
        chew_w = w * 0.88
        chew_d = d * 0.88
        chew_h = 0.14

        chew = box(chew_w, chew_h, chew_d)

        # Add cusp bumps (small cylinders at four corners + central ridge)
        if type_index >= 5:  # molars: 4 cusps
            cusp_h = 0.10
            cusp_r = min(chew_w, chew_d) * 0.13
            for dx in [-chew_w * 0.27, chew_w * 0.27]:
                for dz in [-chew_d * 0.27, chew_d * 0.27]:
                    c = cyl(cusp_r, cusp_h, sections=8)
                    translate(c, dx, chew_h / 2.0 + cusp_h / 2.0, dz)
                    chew = trimesh.util.concatenate([chew, c])
        else:  # premolars: 2 cusps
            cusp_h = 0.09
            cusp_r = min(chew_w, chew_d) * 0.15
            for dz in [-chew_d * 0.27, chew_d * 0.27]:
                c = cyl(cusp_r, cusp_h, sections=8)
                translate(c, 0, chew_h / 2.0 + cusp_h / 2.0, dz)
                chew = trimesh.util.concatenate([chew, c])

        # Position chewing surface at occlusal plane
        chew_y_offset = (-h * 0.45 - chew_h) if is_upper else (h * 0.45 + chew_h)
        translate(chew, 0, chew_y_offset, 0)
        rotate_y(chew, rot_angle)
        translate(chew, x, y_base, z)
        named(chew, f'{tooth_id}_chewing')
        all_meshes.append(chew)


# ---------------------------------------------------------------------------
# Generate all teeth
# ---------------------------------------------------------------------------

for i, tid in enumerate(UPPER_RIGHT):
    create_tooth(tid, is_upper=True,  is_right=True,  type_index=i)

for i, tid in enumerate(UPPER_LEFT):
    create_tooth(tid, is_upper=True,  is_right=False, type_index=i)

for i, tid in enumerate(LOWER_RIGHT):
    create_tooth(tid, is_upper=False, is_right=True,  type_index=i)

for i, tid in enumerate(LOWER_LEFT):
    create_tooth(tid, is_upper=False, is_right=False, type_index=i)

# ---------------------------------------------------------------------------
# Build the scene with all meshes + gum arches
# ---------------------------------------------------------------------------

scene = trimesh.Scene()

# Add tooth meshes  (must be individually named for manifest validation)
for m in all_meshes:
    nm = m.metadata['name']
    scene.add_geometry(m, node_name=nm, geom_name=nm)

# Add gum arches (these are cosmetic – NOT in the manifest, so validate won't check them)
upper_gum = make_gum_arch(is_upper=True)
lower_gum = make_gum_arch(is_upper=False)
scene.add_geometry(upper_gum, node_name='gum_upper', geom_name='gum_upper')
scene.add_geometry(lower_gum, node_name='gum_lower', geom_name='gum_lower')

# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

out_path = 'public/mouth.glb'
scene.export(out_path)

tooth_count = len([m for m in all_meshes if m.metadata['name'].endswith('_outer')
                   or m.metadata['name'].endswith('_inner')
                   or m.metadata['name'].endswith('_chewing')])
print(f"Exported {out_path}")
print(f"  Tooth mesh parts : {len(all_meshes)}")
print(f"  Total scene nodes: {len(list(scene.graph.nodes))}")

import os
size_kb = os.path.getsize(out_path) // 1024
print(f"  File size        : {size_kb} KB")
