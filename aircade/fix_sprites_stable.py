import cv2
import numpy as np

def process_spritesheet(input_path, output_path):
    img = cv2.imread(input_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        print(f"Error loading {input_path}")
        return

    alpha = img[:, :, 3]
    _, mask = cv2.threshold(alpha, 10, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    bounding_boxes = []
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        if w > 40 and h > 50:
            bounding_boxes.append((x, y, w, h, cnt))
            
    new_img = np.zeros((1024, 1024, 4), dtype=np.uint8)
    
    for row in range(4):
        row_y_min = row * 256
        row_y_max = (row + 1) * 256
        
        row_boxes = []
        for (x, y, w, h, cnt) in bounding_boxes:
            center_y = y + h/2
            if row_y_min <= center_y < row_y_max:
                row_boxes.append((x, y, w, h, cnt))
                
        row_boxes.sort(key=lambda b: b[2] * b[3], reverse=True)
        best_4 = row_boxes[:4]
        best_4.sort(key=lambda b: b[0])
        
        for col, (x, y, w, h, cnt) in enumerate(best_4):
            sprite = img[y:y+h, x:x+w]
            
            # To stabilize left/right animations, we shouldn't center by the whole bounding box width,
            # because the width changes as legs/arms extend.
            # Instead, let's find the center of the top 30% of the sprite (the head/torso).
            
            sprite_mask = mask[y:y+h, x:x+w]
            
            # Get the top 30% of the mask
            top_part = int(h * 0.3)
            top_mask = sprite_mask[0:top_part, :]
            
            # Find the horizontal center of mass of the top part (the head)
            M = cv2.moments(top_mask)
            if M["m00"] != 0:
                head_cx = int(M["m10"] / M["m00"])
            else:
                head_cx = w // 2 # fallback
                
            target_cell_x = col * 256
            target_cell_y = row * 256
            
            # We want the head_cx to land exactly in the horizontal center of the 256x256 cell (which is 128)
            # So paste_x + head_cx = target_cell_x + 128
            paste_x = target_cell_x + 128 - head_cx
            
            # We also want the bottom of the feet to align perfectly so the character doesn't bob up and down.
            # Let's align the bottom of the bounding box to a fixed height in the cell, say y=220
            paste_y = target_cell_y + 220 - h
            
            # Ensure we don't go out of bounds
            if paste_x < target_cell_x: paste_x = target_cell_x
            if paste_y < target_cell_y: paste_y = target_cell_y
            
            # Paste size might exceed cell if we adjust too much, handle clipping
            paste_w = min(w, target_cell_x + 256 - paste_x)
            paste_h = min(h, target_cell_y + 256 - paste_y)
            
            # Source crop if necessary
            src_w = paste_w
            src_h = paste_h
            
            new_img[paste_y:paste_y+paste_h, paste_x:paste_x+paste_w] = sprite[0:src_h, 0:src_w]
            
    cv2.imwrite(output_path, new_img)
    print(f"Successfully processed stabilized spritesheet and saved to {output_path}")

if __name__ == "__main__":
    process_spritesheet('public/player_sheet_aligned.png', 'public/player_sheet_aligned_fixed.png')
