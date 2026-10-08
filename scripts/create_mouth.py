import trimesh
import numpy as np

UPPER_RIGHT = ['ur_ci', 'ur_li', 'ur_c', 'ur_pm1', 'ur_pm2', 'ur_m1', 'ur_m2']
UPPER_LEFT  = ['ul_ci', 'ul_li', 'ul_c', 'ul_pm1', 'ul_pm2', 'ul_m1', 'ul_m2']
LOWER_RIGHT = ['lr_ci', 'lr_li', 'lr_c', 'lr_pm1', 'lr_pm2', 'lr_m1', 'lr_m2']
LOWER_LEFT  = ['ll_ci', 'll_li', 'll_c', 'll_pm1', 'll_pm2', 'll_m1', 'll_m2']

angles_deg = [5, 15, 27, 40, 55, 70, 85]
a = 4.0 # x radius
b = 5.0 # z radius

meshes = []

def create_tooth(id, is_upper, is_right, is_posterior, index):
    t = np.radians(angles_deg[index])
    sign_x = 1 if is_right else -1
    y = 1.2 if is_upper else -1.2
    
    # Calculate position
    x = a * np.sin(t) * sign_x
    z = b * np.cos(t) - b
    
    # The normal pointing "out" from the mouth (away from origin-ish)
    # The rotation around Y axis to face outward
    rot_y = t * sign_x
    
    # Dimensions of the whole tooth
    width = 0.8
    height = 1.2
    depth = 0.8
    
    tooth_meshes = []
    
    if is_posterior:
        # 3 parts: outer, inner, chewing
        # Upper teeth point down (chewing is bottom). Lower point up (chewing is top).
        chew_y = -height/2 + 0.1 if is_upper else height/2 - 0.1
        body_h = height - 0.2
        body_y = 0.1 if is_upper else -0.1
        
        # Outer half
        outer = trimesh.creation.box(extents=[width, body_h, depth/2])
        outer.apply_translation([0, body_y, depth/4])
        outer.visual.vertex_colors = [255, 255, 255, 255]
        outer.metadata['name'] = f"{id}_outer"
        tooth_meshes.append(outer)
        
        # Inner half
        inner = trimesh.creation.box(extents=[width, body_h, depth/2])
        inner.apply_translation([0, body_y, -depth/4])
        inner.visual.vertex_colors = [220, 220, 220, 255]
        inner.metadata['name'] = f"{id}_inner"
        tooth_meshes.append(inner)
        
        # Chewing pad
        chewing = trimesh.creation.box(extents=[width, 0.2, depth])
        chewing.apply_translation([0, chew_y, 0])
        chewing.visual.vertex_colors = [200, 255, 200, 255]
        chewing.metadata['name'] = f"{id}_chewing"
        tooth_meshes.append(chewing)
    else:
        # Anterior: 2 parts: outer, inner
        # Outer
        outer = trimesh.creation.box(extents=[width, height, depth/2])
        outer.apply_translation([0, 0, depth/4])
        outer.visual.vertex_colors = [255, 255, 255, 255]
        outer.metadata['name'] = f"{id}_outer"
        tooth_meshes.append(outer)
        
        # Inner
        inner = trimesh.creation.box(extents=[width, height, depth/2])
        inner.apply_translation([0, 0, -depth/4])
        inner.visual.vertex_colors = [220, 220, 220, 255]
        inner.metadata['name'] = f"{id}_inner"
        tooth_meshes.append(inner)

    # Combine parts into positioned meshes
    rot_matrix = trimesh.transformations.rotation_matrix(rot_y, [0, 1, 0])
    trans_matrix = trimesh.transformations.translation_matrix([x, y, z])
    final_transform = trimesh.transformations.concatenate_matrices(trans_matrix, rot_matrix)
    
    for m in tooth_meshes:
        m.apply_transform(final_transform)
        meshes.append(m)

# Build the mouth
for i, t_id in enumerate(UPPER_RIGHT):
    create_tooth(t_id, True, True, i >= 3, i)
for i, t_id in enumerate(UPPER_LEFT):
    create_tooth(t_id, True, False, i >= 3, i)
for i, t_id in enumerate(LOWER_RIGHT):
    create_tooth(t_id, False, True, i >= 3, i)
for i, t_id in enumerate(LOWER_LEFT):
    create_tooth(t_id, False, False, i >= 3, i)

# We want each mesh to retain its name in the GLB
# trimesh Scene
scene = trimesh.Scene()
for m in meshes:
    name = m.metadata['name']
    scene.add_geometry(m, node_name=name, geom_name=name)

# Export as GLB
scene.export('public/mouth.glb')
print("Successfully created public/mouth.glb with", len(meshes), "meshes.")
