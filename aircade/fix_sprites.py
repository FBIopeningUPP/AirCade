import cv2
import numpy as np
from PIL import Image

def process_spritesheet(input_path, output_path):
    # Load image with alpha channel
    img = cv2.imread(input_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        print(f"Error loading {input_path}")
        return

    # Extract alpha channel
    alpha = img[:, :, 3]
    
    # Threshold alpha to get binary mask of sprites
    _, mask = cv2.threshold(alpha, 10, 255, cv2.THRESH_BINARY)
    
    # Find contours
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    bounding_boxes = []
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        if w > 50 and h > 50:  # Ignore tiny noise
            bounding_boxes.append((x, y, w, h))
            
    # We want exactly 4 valid sprites per row. The image is 1024x1024, so 4 rows of 256.
    new_img = np.zeros((1024, 1024, 4), dtype=np.uint8)
    
    for row in range(4):
        row_y_min = row * 256
        row_y_max = (row + 1) * 256
        
        # Get bounding boxes that fall primarily in this row
        row_boxes = []
        for (x, y, w, h) in bounding_boxes:
            center_y = y + h/2
            if row_y_min <= center_y < row_y_max:
                row_boxes.append((x, y, w, h))
                
        # Sort left to right
        row_boxes.sort(key=lambda b: b[0])
        
        # We need to pick 4 "good" sprites. 
        # A good sprite is one that is completely whole. 
        # We can assume the full sprites are wider than chopped ones.
        # But also, looking at the image, there are exactly 4 full sprites per row.
        # Let's filter out ones that touch the very left/right edge?
        # Actually, let's just pick the 4 largest area ones!
        
        row_boxes.sort(key=lambda b: b[2] * b[3], reverse=True)
        best_4 = row_boxes[:4]
        best_4.sort(key=lambda b: b[0])  # Re-sort left to right
        
        # Place them in the new image
        for col, (x, y, w, h) in enumerate(best_4):
            # Extract the sprite pixels
            sprite = img[y:y+h, x:x+w]
            
            # Target center in the 256x256 cell
            target_cell_x = col * 256
            target_cell_y = row * 256
            
            # Calculate paste coordinates (center it)
            paste_x = target_cell_x + (256 - w) // 2
            paste_y = target_cell_y + (256 - h) // 2
            
            # Copy into new image
            new_img[paste_y:paste_y+h, paste_x:paste_x+w] = sprite
            
    cv2.imwrite(output_path, new_img)
    print(f"Successfully processed spritesheet and saved to {output_path}")

if __name__ == "__main__":
    process_spritesheet('public/player_sheet_aligned.png', 'public/player_sheet_aligned_fixed.png')
