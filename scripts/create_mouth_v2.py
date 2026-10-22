"""
create_mouth_v2.py – Anatomical, organic 3D mouth model for Toothbrush Clinic V2.

Generates public/mouth.glb with:
  - Exactly 72 addressable tooth surface meshes (matching MOUTH_MANIFEST):
      28 outer + 28 inner + 16 chewing (posteriors only) = 72 surfaces
  - 2 symmetric, natural gum arches (gum_upper, gum_lower) framing tooth roots.
  - Anatomical tooth morphology:
      - Incisors: chisel/spade profile with incisal edge and rounded corners
      - Canines: pointed crowns with sloping shoulders
      - Premolars: wide bicuspids with buccal & lingual cusps
      - Molars: large 4-cusped occlusal tables with developmental grooves
"""

import trimesh
import numpy as np

UPPER_RIGHT = ['ur_ci', 'ur_li', 'ur_c', 'ur_pm1', 'ur_pm2', 'ur_m1', 'ur_m2']
UPPER_LEFT  = ['ul_ci', 'ul_li', 'ul_c', 'ul_pm1', 'ul_pm2', 'ul_m1', 'ul_m2']
LOWER_RIGHT = ['lr_ci', 'lr_li', 'lr_c', 'lr_pm1', 'lr_pm2', 'lr_m1', 'lr_m2']
LOWER_LEFT  = ['ll_ci', 'll_li', 'll_c', 'll_pm1', 'll_pm2', 'll_m1', 'll_m2']

POSTERIOR_IDS = {
    'ur_pm1', 'ur_pm2', 'ur_m1', 'ur_m2',
    'ul_pm1', 'ul_pm2', 'ul_m1', 'ul_m2',
    'lr_pm1', 'lr_pm2', 'lr_m1', 'lr_m2',
    'll_pm1', 'll_pm2', 'll_m1', 'll_m2',
}

# Angular placement along dental arch ellipse (from midline to back molars)
angles_deg = [4.2, 12.5, 22.0, 33.5, 46.5, 61.0, 76.5]

ARCH_A = 4.8   # width semi-axis (X)
ARCH_B = 5.6   # depth semi-axis (Z)

UPPER_GUM_Y =  1.30
LOWER_GUM_Y = -1.30

# Dimensions per tooth type [ci, li, c, pm1, pm2, m1, m2]
# (width mesiodistal, height crown, depth buccolingual)
CROWN_DIMS = [
    (0.82, 1.05, 0.35),  # ci: central incisor
    (0.68, 0.95, 0.32),  # li: lateral incisor
    (0.74, 1.15, 0.42),  # c:  canine
    (0.84, 0.82, 0.72),  # pm1: 1st premolar
    (0.88, 0.80, 0.75),  # pm2: 2nd premolar
    (1.16, 0.86, 0.98),  # m1:  1st molar
    (1.10, 0.80, 0.92),  # m2:  2nd molar
]

def make_anatomical_crown(type_index, w, h, d, is_upper):
    biting_dir = -1.0 if is_upper else 1.0

    if type_index in (0, 1): # Incisors (ci, li) - chisel/spade shaped
        m = trimesh.creation.box(extents=[w, h, d]).subdivide().subdivide().subdivide()
        v = m.vertices.copy()

        y_norm = (v[:, 1] * biting_dir / (h * 0.5) + 1.0) * 0.5
        y_norm = np.clip(y_norm, 0.0, 1.0)

        # Chisel blade: thin at incisal edge, thicker at cervical line
        z_thick = 1.12 - 0.72 * (y_norm ** 1.3)
        v[:, 2] *= z_thick

        # Spade width: wider at incisal edge, narrower at root
        x_width = 0.82 + 0.32 * y_norm
        v[:, 0] *= x_width

        # Convex labial face (+Z)
        labial = v[:, 2] > 0
        v[labial, 2] += 0.05 * (1.0 - (v[labial, 0] / (w * 0.55))**2) * (1.0 - y_norm[labial] * 0.5)

        # Lingual concavity near biting edge
        lingual = v[:, 2] < 0
        v[lingual, 2] *= (1.0 - 0.20 * y_norm[lingual])

        # Soft rounded corners
        edge_dist = (np.abs(v[:, 0]) / (w * 0.5 * x_width))**6 + (y_norm)**6
        round_mask = edge_dist > 0.75
        v[round_mask, 0] *= 0.93

        return trimesh.Trimesh(vertices=v, faces=m.faces)

    elif type_index == 2: # Canine (c) - pointed diamond cusp with rounded ridges
        m = trimesh.creation.box(extents=[w, h, d]).subdivide().subdivide().subdivide()
        v = m.vertices.copy()

        y_norm = (v[:, 1] * biting_dir / (h * 0.5) + 1.0) * 0.5
        y_norm = np.clip(y_norm, 0.0, 1.0)

        cusp_taper = 1.0 - 0.52 * (y_norm ** 1.5)
        shoulder_taper = 1.0 - 0.32 * (np.abs(v[:, 0]) / (w * 0.5)) * y_norm

        v[:, 0] *= cusp_taper * shoulder_taper
        v[:, 2] *= (1.0 - 0.42 * y_norm)

        # Labial central ridge
        labial = v[:, 2] > 0
        v[labial, 2] += 0.07 * (1.0 - (v[labial, 0] / (w * 0.45))**2) * y_norm[labial]

        apex = y_norm > 0.85
        v[apex, 1] += 0.08 * biting_dir * (1.0 - (v[apex, 0] / (w * 0.3))**2)

        return trimesh.Trimesh(vertices=v, faces=m.faces)

    elif type_index in (3, 4): # Premolars (pm1, pm2) - wide bicuspid
        m = trimesh.creation.box(extents=[w, h, d]).subdivide().subdivide().subdivide()
        v = m.vertices.copy()

        x_norm = v[:, 0] / (w * 0.5)
        z_norm = v[:, 2] / (d * 0.5)

        theta = np.arctan2(z_norm, x_norm)
        cos_t = np.abs(np.cos(theta)) + 1e-6
        sin_t = np.abs(np.sin(theta)) + 1e-6
        squircle_r = 1.0 / (cos_t**4 + sin_t**4)**0.25
        r_norm = np.sqrt(x_norm**2 + z_norm**2)

        # Rounded squircle contour without accidental shrinking
        r_target = r_norm * (0.80 + 0.20 * squircle_r)
        v[:, 0] = np.clip(r_target * np.cos(theta), -1.0, 1.0) * (w * 0.5)
        v[:, 2] = np.clip(r_target * np.sin(theta), -1.0, 1.0) * (d * 0.5)

        y_norm = (v[:, 1] * biting_dir / (h * 0.5) + 1.0) * 0.5
        occlusal = y_norm > 0.4

        b_dist = (v[:, 0])**2 + (v[:, 2] - d * 0.25)**2
        l_dist = (v[:, 0])**2 + (v[:, 2] + d * 0.22)**2
        b_cusp = 0.09 * np.exp(-b_dist / 0.04)
        l_cusp = 0.07 * np.exp(-l_dist / 0.04)
        groove = 0.04 * np.exp(-(v[:, 2]**2) / 0.015)

        v[occlusal, 1] += (b_cusp[occlusal] + l_cusp[occlusal] - groove[occlusal]) * biting_dir
        return trimesh.Trimesh(vertices=v, faces=m.faces)

    else: # Molars (m1, m2) - large, powerful 4-cusped occlusal table
        m = trimesh.creation.box(extents=[w, h, d]).subdivide().subdivide().subdivide()
        v = m.vertices.copy()

        x_norm = v[:, 0] / (w * 0.5)
        z_norm = v[:, 2] / (d * 0.5)

        theta = np.arctan2(z_norm, x_norm)
        cos_t = np.abs(np.cos(theta)) + 1e-6
        sin_t = np.abs(np.sin(theta)) + 1e-6
        squircle_r = 1.0 / (cos_t**4 + sin_t**4)**0.25
        r_norm = np.sqrt(x_norm**2 + z_norm**2)

        # Rounded squircle contour keeping full anatomical molar dimensions
        r_target = r_norm * (0.82 + 0.18 * squircle_r)
        v[:, 0] = np.clip(r_target * np.cos(theta), -1.0, 1.0) * (w * 0.5)
        v[:, 2] = np.clip(r_target * np.sin(theta), -1.0, 1.0) * (d * 0.5)

        y_norm = (v[:, 1] * biting_dir / (h * 0.5) + 1.0) * 0.5
        occlusal = y_norm > 0.35

        cusp_offsets = [
            (-w * 0.25,  d * 0.24),
            ( w * 0.25,  d * 0.24),
            (-w * 0.25, -d * 0.24),
            ( w * 0.25, -d * 0.24),
        ]
        cusp_elev = np.zeros(len(v))
        for cx, cz in cusp_offsets:
            dist_sq = (v[:, 0] - cx)**2 + (v[:, 2] - cz)**2
            cusp_elev += 0.09 * np.exp(-dist_sq / 0.04)

        dist_center = (v[:, 0])**2 + (v[:, 2])**2
        pit_depth = 0.045 * np.exp(-dist_center / 0.04)

        v[occlusal, 1] += (cusp_elev[occlusal] - pit_depth[occlusal]) * biting_dir
        return trimesh.Trimesh(vertices=v, faces=m.faces)

def partition_tooth_surfaces(tooth_mesh, is_posterior, is_upper):
    face_centers = tooth_mesh.triangles_center
    face_normals = tooth_mesh.face_normals
    biting_dir = -1.0 if is_upper else 1.0

    if is_posterior:
        chewing_mask = (face_normals[:, 1] * biting_dir > 0.28) & (face_centers[:, 1] * biting_dir > -0.05)
        outer_mask = (~chewing_mask) & (face_centers[:, 2] >= 0.0)
        inner_mask = (~chewing_mask) & (~outer_mask)

        chew_mesh  = tooth_mesh.submesh([chewing_mask], append=True)
        outer_mesh = tooth_mesh.submesh([outer_mask], append=True)
        inner_mesh = tooth_mesh.submesh([inner_mask], append=True)
        return outer_mesh, inner_mesh, chew_mesh
    else:
        outer_mask = face_centers[:, 2] >= 0.0
        inner_mask = ~outer_mask

        outer_mesh = tooth_mesh.submesh([outer_mask], append=True)
        inner_mesh = tooth_mesh.submesh([inner_mask], append=True)
        return outer_mesh, inner_mesh, None

def make_full_gum_arch(is_upper, segments=64):
    """
    Symmetric natural alveolar gum arch spanning from left molars through midline
    to right molars. Sits above upper tooth roots and below lower tooth roots.
    """
    y_base = UPPER_GUM_Y if is_upper else LOWER_GUM_Y
    sign_y = 1.0 if is_upper else -1.0
    ridge_h = 0.85 * sign_y

    profile = [
        (-0.65, 0.0),                  # lingual margin
        (-0.45, ridge_h * 0.45),       # lingual curvature
        ( 0.00, ridge_h * 0.95),       # ridge apex
        ( 0.48, ridge_h * 0.45),       # buccal curvature
        ( 0.75, 0.0),                  # buccal margin
    ]

    verts = []
    faces = []

    max_rad = np.radians(88.0)
    t_vals = np.linspace(-max_rad, max_rad, segments + 1)

    for t in t_vals:
        cx = ARCH_A * np.sin(t)
        cz = ARCH_B * np.cos(t) - ARCH_B

        tx = ARCH_A * np.cos(t)
        tz = -ARCH_B * np.sin(t)
        t_len = np.sqrt(tx**2 + tz**2) + 1e-6
        tx /= t_len
        tz /= t_len

        # Outward buccal normal
        nx = -tz
        nz =  tx

        for w_off, h_off in profile:
            px = cx + nx * w_off
            pz = cz + nz * w_off
            py = y_base + h_off
            verts.append([px, py, pz])

    n_prof = len(profile)
    for i in range(segments):
        for j in range(n_prof - 1):
            p0 = i * n_prof + j
            p1 = p0 + 1
            p2 = (i + 1) * n_prof + j
            p3 = p2 + 1
            faces.append([p0, p2, p1])
            faces.append([p1, p2, p3])

    gum = trimesh.Trimesh(vertices=np.array(verts, dtype=np.float32),
                          faces=np.array(faces, dtype=np.int32))
    return gum

def build_scene():
    all_meshes = []

    def create_single_tooth(tooth_id, is_upper, is_right, type_index):
        w, h, d = CROWN_DIMS[type_index]
        is_posterior = tooth_id in POSTERIOR_IDS

        crown = make_anatomical_crown(type_index, w, h, d, is_upper)
        trimesh.smoothing.filter_laplacian(crown, iterations=2)
        outer_m, inner_m, chew_m = partition_tooth_surfaces(crown, is_posterior, is_upper)

        t = np.radians(angles_deg[type_index])
        sign_x = 1.0 if is_right else -1.0
        x = ARCH_A * np.sin(t) * sign_x
        z = ARCH_B * np.cos(t) - ARCH_B

        y_base = UPPER_GUM_Y if is_upper else LOWER_GUM_Y
        crown_y = y_base + (-h * 0.48 if is_upper else h * 0.48)
        rot_angle = t * sign_x

        rot_m = trimesh.transformations.rotation_matrix(rot_angle, [0, 1, 0])
        trans_m = trimesh.transformations.translation_matrix([x, crown_y, z])
        world_transform = trans_m @ rot_m

        outer_m.apply_transform(world_transform)
        inner_m.apply_transform(world_transform)

        outer_m.metadata['name'] = f'{tooth_id}_outer'
        inner_m.metadata['name'] = f'{tooth_id}_inner'
        all_meshes.append(outer_m)
        all_meshes.append(inner_m)

        if is_posterior and chew_m is not None:
            chew_m.apply_transform(world_transform)
            chew_m.metadata['name'] = f'{tooth_id}_chewing'
            all_meshes.append(chew_m)

    for i, tid in enumerate(UPPER_RIGHT): create_single_tooth(tid, True,  True,  i)
    for i, tid in enumerate(UPPER_LEFT):  create_single_tooth(tid, True,  False, i)
    for i, tid in enumerate(LOWER_RIGHT): create_single_tooth(tid, False, True,  i)
    for i, tid in enumerate(LOWER_LEFT):  create_single_tooth(tid, False, False, i)

    # Build symmetric gum arches
    gum_u = make_full_gum_arch(True)
    gum_u.metadata['name'] = 'gum_upper'
    all_meshes.append(gum_u)

    gum_l = make_full_gum_arch(False)
    gum_l.metadata['name'] = 'gum_lower'
    all_meshes.append(gum_l)

    scene = trimesh.Scene()
    for m in all_meshes:
        name = m.metadata['name']
        scene.add_geometry(m, node_name=name, geom_name=name)

    scene.export('public/mouth.glb')
    print(f"Successfully exported public/mouth.glb with {len(all_meshes)} meshes.")

if __name__ == '__main__':
    build_scene()
