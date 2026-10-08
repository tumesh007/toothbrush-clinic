import trimesh
import numpy as np

UPPER_RIGHT = ['ur_ci', 'ur_li', 'ur_c', 'ur_pm1', 'ur_pm2', 'ur_m1', 'ur_m2']
UPPER_LEFT  = ['ul_ci', 'ul_li', 'ul_c', 'ul_pm1', 'ul_pm2', 'ul_m1', 'ul_m2']
LOWER_RIGHT = ['lr_ci', 'lr_li', 'lr_c', 'lr_pm1', 'lr_pm2', 'lr_m1', 'lr_m2']
LOWER_LEFT  = ['ll_ci', 'll_li', 'll_c', 'll_pm1', 'll_pm2', 'll_m1', 'll_m2']

angles_deg = [5, 15, 27, 40, 55, 70, 85]
a = 4.0
b = 5.0
meshes = []

def make_scale_matrix(sx, sy, sz):
    m = np.eye(4)
    m[0, 0] = sx
    m[1, 1] = sy
    m[2, 2] = sz
    return m

def create_part(sx, sy, sz, tx, ty, tz, name):
    m = trimesh.creation.icosphere(subdivisions=3, radius=1.0)
    m.apply_transform(make_scale_matrix(sx, sy, sz))
    m.apply_translation([tx, ty, tz])
    m.metadata['name'] = name
    return m

def create_tooth(tooth_id, is_upper, is_right, is_posterior, index):
    t = np.radians(angles_deg[index])
    sign_x = 1.0 if is_right else -1.0
    y_center = 1.2 if is_upper else -1.2
    x = a * np.sin(t) * sign_x
    z = b * np.cos(t) - b
    rot_y = t * sign_x

    tooth_meshes = []

    if is_posterior:
        w = 0.45 + index * 0.04
        h = 0.55
        d = 0.30 + index * 0.03
        body_y = -h * 0.3 if is_upper else h * 0.3
        chew_y = (-h - 0.05) if is_upper else (h + 0.05)

        outer   = create_part(w, h, d*0.6,  0, body_y,  d*0.5, f"{tooth_id}_outer")
        inner   = create_part(w, h, d*0.6,  0, body_y, -d*0.5, f"{tooth_id}_inner")
        chewing = create_part(w*0.85, 0.12, d*0.95, 0, chew_y, 0, f"{tooth_id}_chewing")
        tooth_meshes += [outer, inner, chewing]
    else:
        w = 0.38 - index * 0.02
        h = 0.65
        d = 0.14
        body_y = -h * 0.2 if is_upper else h * 0.2

        outer = create_part(w, h, d,  0, body_y,  d, f"{tooth_id}_outer")
        inner = create_part(w, h, d,  0, body_y, -d, f"{tooth_id}_inner")
        tooth_meshes += [outer, inner]

    rot_m   = trimesh.transformations.rotation_matrix(rot_y, [0, 1, 0])
    trans_m = trimesh.transformations.translation_matrix([x, y_center, z])
    final   = trans_m @ rot_m

    for m in tooth_meshes:
        m.apply_transform(final)
        meshes.append(m)

for i, tid in enumerate(UPPER_RIGHT): create_tooth(tid, True,  True,  i>=3, i)
for i, tid in enumerate(UPPER_LEFT):  create_tooth(tid, True,  False, i>=3, i)
for i, tid in enumerate(LOWER_RIGHT): create_tooth(tid, False, True,  i>=3, i)
for i, tid in enumerate(LOWER_LEFT):  create_tooth(tid, False, False, i>=3, i)

scene = trimesh.Scene()
for m in meshes:
    name = m.metadata['name']
    scene.add_geometry(m, node_name=name, geom_name=name)

scene.export('public/mouth.glb')
print(f"Exported public/mouth.glb — {len(meshes)} meshes.")
